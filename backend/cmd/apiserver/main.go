package main

// @title DomainFlow API
// @version 1.0
// @description DomainFlow API for domain generation, validation, and campaign management
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.url http://www.domainflow.com/support
// @contact.email support@domainflow.com

// @license.name MIT
// @license.url https://opensource.org/licenses/MIT

// @host localhost:8080
// @basePath /

// @securityDefinitions.apikey SessionAuth
// @in cookie
// @name session_id
// @description Session-based authentication using HTTP cookies

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"github.com/fntelecomllc/studio/backend/internal/api"
	"github.com/fntelecomllc/studio/backend/internal/config"
	_ "github.com/fntelecomllc/studio/backend/docs"
	"github.com/fntelecomllc/studio/backend/internal/httpvalidator"
	"github.com/fntelecomllc/studio/backend/internal/keywordscanner"
	"github.com/fntelecomllc/studio/backend/internal/middleware"
	"github.com/fntelecomllc/studio/backend/internal/proxymanager"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	pg_store "github.com/fntelecomllc/studio/backend/internal/store/postgres"
	"github.com/fntelecomllc/studio/backend/internal/websocket"
)

const (
	dbTypePostgres    = "postgres"
	defaultNumWorkers = 5
)

func main() {
	log.Println("Starting DomainFlow API Server...")

	// Load .env file from project root
	envPath := filepath.Join("..", ".env")
	if err := godotenv.Load(envPath); err != nil {
		log.Printf("Warning: Could not load .env file from %s: %v", envPath, err)
		log.Println("Continuing with system environment variables...")
	} else {
		log.Printf("Successfully loaded environment variables from %s", envPath)
	}

	// Load configuration with environment variable support
	appConfig, err := config.LoadWithEnv("")
	if err != nil {
		log.Printf("Warning: Failed to load config file: %v", err)
		log.Println("Using environment variables and defaults...")
		// Create minimal config from environment
		appConfig = &config.AppConfig{}
		config.LoadWithEnv("") // This will apply env overrides even without config file
	}
	log.Println("Configuration loaded with environment overrides.")

	wsBroadcaster := websocket.InitGlobalBroadcaster()
	log.Println("Global WebSocket broadcaster initialized and started.")

	// Initialize PostgreSQL database connection
	log.Println("Initializing PostgreSQL database connection...")

	var campaignStore store.CampaignStore
	var personaStore store.PersonaStore
	var proxyStore store.ProxyStore
	var keywordStore store.KeywordStore
	var auditLogStore store.AuditLogStore
	var campaignJobStore store.CampaignJobStore
	var db *sqlx.DB

	// Use database configuration from enhanced config
	var dsn string
	if appConfig.Server.DatabaseConfig != nil {
		dsn = config.GetDatabaseDSN(appConfig.Server.DatabaseConfig)
	} else {
		// Fallback to environment variables for backward compatibility
		dbHost := os.Getenv("DB_HOST")
		dbPort := os.Getenv("DB_PORT")
		dbUser := os.Getenv("DB_USER")
		dbPassword := os.Getenv("DB_PASSWORD")
		dbName := os.Getenv("DB_NAME")
		dbSSLMode := os.Getenv("DB_SSLMODE")

		if dbHost == "" {
			dbHost = "localhost"
		}
		if dbPort == "" {
			dbPort = "5432"
		}
		if dbUser == "" {
			dbUser = "domainflow"
		}
		if dbPassword == "" {
			dbPassword = "domainflow_dev_password"
		}
		if dbName == "" {
			dbName = "domainflow_dev"
		}
		if dbSSLMode == "" {
			dbSSLMode = "disable"
		}

		dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			dbHost, dbPort, dbUser, dbPassword, dbName, dbSSLMode)
	}

	var pgErr error
	db, pgErr = sqlx.Connect("postgres", dsn)
	if pgErr != nil {
		log.Fatalf("FATAL: Could not connect to PostgreSQL database: %v", pgErr)
	}
	defer db.Close()

	db.SetMaxOpenConns(appConfig.Server.DBMaxOpenConns)
	db.SetMaxIdleConns(appConfig.Server.DBMaxIdleConns)
	db.SetConnMaxLifetime(time.Duration(appConfig.Server.DBConnMaxLifetimeMinutes) * time.Minute)
	log.Println("Successfully connected to PostgreSQL database.")

	campaignStore = pg_store.NewCampaignStorePostgres(db)
	personaStore = pg_store.NewPersonaStorePostgres(db)
	proxyStore = pg_store.NewProxyStorePostgres(db)
	keywordStore = pg_store.NewKeywordStorePostgres(db)
	auditLogStore = pg_store.NewAuditLogStorePostgres(db)
	campaignJobStore = pg_store.NewCampaignJobStorePostgres(db)
	log.Println("PostgreSQL-backed stores initialized.")

	var defaultProxyTimeout time.Duration = 30 * time.Second
	if appConfig.HTTPValidator.RequestTimeoutSeconds > 0 {
		defaultProxyTimeout = time.Duration(appConfig.HTTPValidator.RequestTimeoutSeconds) * time.Second
	}
	proxyMgr := proxymanager.NewProxyManager(appConfig.Proxies, defaultProxyTimeout)
	log.Println("ProxyManager initialized.")

	httpValSvc := httpvalidator.NewHTTPValidator(appConfig)
	log.Println("HTTPValidator service initialized.")

	kwordScannerSvc := keywordscanner.NewService(keywordStore)
	log.Println("KeywordScanner service initialized.")

	// Initialize session service for session-based authentication
	sessionConfig := config.GetDefaultSessionSettings()
	sessionService, err := services.NewSessionService(db, sessionConfig.ToServiceConfig(), auditLogStore)
	if err != nil {
		log.Fatalf("FATAL: Failed to initialize session service: %v", err)
	}
	log.Println("Session service initialized.")

	// All stores including campaignJobStore are now properly initialized above
	domainGenSvc := services.NewDomainGenerationService(db, campaignStore, campaignJobStore, auditLogStore)
	log.Println("DomainGenerationService initialized.")

	dnsCampaignSvc := services.NewDNSCampaignService(db, campaignStore, personaStore, auditLogStore, campaignJobStore, appConfig)
	log.Println("DNSCampaignService initialized.")

	httpKeywordCampaignSvc := services.NewHTTPKeywordCampaignService(
		db,
		campaignStore, personaStore, proxyStore, keywordStore, auditLogStore,
		campaignJobStore,
		httpValSvc, kwordScannerSvc, proxyMgr, appConfig,
	)
	log.Println("HTTPKeywordCampaignService initialized.")

	campaignOrchestratorSvc := services.NewCampaignOrchestratorService(
		db,
		campaignStore,
		personaStore,
		keywordStore,
		auditLogStore,
		campaignJobStore,
		domainGenSvc,
		dnsCampaignSvc,
		httpKeywordCampaignSvc,
	)
	log.Println("CampaignOrchestratorService initialized.")

	serverInstanceID, _ := os.Hostname()
	if serverInstanceID == "" {
		serverInstanceID = uuid.NewString()
	}
	workerService := services.NewCampaignWorkerService(
		campaignJobStore,
		domainGenSvc,
		dnsCampaignSvc,
		httpKeywordCampaignSvc,
		campaignOrchestratorSvc,
		serverInstanceID,
		appConfig,
	)
	log.Println("CampaignWorkerService initialized.")

	apiHandler := api.NewAPIHandler(
		appConfig,
		db,
		proxyMgr,
		campaignStore,
		personaStore,
		proxyStore,
		keywordStore,
		auditLogStore,
		campaignJobStore,
	)
	log.Println("Main APIHandler initialized.")

	campaignOrchestratorAPIHandler := api.NewCampaignOrchestratorAPIHandler(campaignOrchestratorSvc)
	log.Println("CampaignOrchestratorAPIHandler initialized.")

	webSocketAPIHandler := api.NewWebSocketHandler(wsBroadcaster, sessionService)
	log.Println("WebSocketAPIHandler initialized.")

	// Initialize authentication and security handlers
	authHandler := api.NewAuthHandler(sessionService, sessionConfig, db)
	log.Println("AuthHandler initialized.")

	// Initialize middleware
	authMiddleware := middleware.NewAuthMiddleware(sessionService, sessionConfig)
	securityMiddleware := middleware.NewSecurityMiddleware()
	rateLimitMiddleware := middleware.NewRateLimitMiddleware()
	log.Println("Security middleware initialized.")

	// Initialize health check handler
	healthCheckHandler := api.NewHealthCheckHandler(db.DB)
	log.Println("HealthCheckHandler initialized.")

	appCtx, appCancel := context.WithCancel(context.Background())
	defer appCancel()

	numWorkers := appConfig.Worker.NumWorkers
	if numWorkers <= 0 {
		numWorkers = defaultNumWorkers
	}
	go workerService.StartWorkers(appCtx, numWorkers)

	gin.SetMode(appConfig.Server.GinMode)
	router := gin.Default()

	// Apply basic security middleware to all routes
	router.Use(securityMiddleware.SecurityHeaders())
	router.Use(securityMiddleware.EnhancedCORS())

	// Add validation middleware for request/response validation
	router.Use(middleware.ValidateRequestMiddleware())
	router.Use(middleware.ValidateResponseMiddleware())

	// Create a middleware group for non-WebSocket routes that need request size limits
	nonWSMiddleware := func() gin.HandlerFunc {
		return gin.HandlerFunc(func(c *gin.Context) {
			// Skip request size limit for WebSocket upgrade requests
			if c.Request.URL.Path == "/api/v2/ws" {
				c.Next()
				return
			}
			// Apply request size limit for other routes
			securityMiddleware.RequestSizeLimit(10 * 1024 * 1024)(c)
		})
	}
	
	router.Use(nonWSMiddleware())
	router.Use(rateLimitMiddleware.IPRateLimit(100, time.Minute)) // 100 requests per minute per IP

	// WebSocket route (registered early to avoid middleware conflicts)
	router.GET("/api/v2/ws", webSocketAPIHandler.HandleConnections)
	log.Println("Registered WebSocket route under /api/v2/ws.")

	// Public routes (no authentication required)
	router.GET("/ping", api.PingHandlerGin)

	// Swagger documentation routes (public)
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	log.Println("Registered Swagger UI route under /swagger/")

	// Authentication routes (public)
	authRoutes := router.Group("/api/v2/auth")
	{
		authRoutes.POST("/login", rateLimitMiddleware.LoginRateLimit(), authHandler.Login)
		authRoutes.POST("/logout", authHandler.Logout)
		authRoutes.POST("/refresh", authHandler.RefreshSession)
	}
	log.Println("Registered authentication routes under /api/v2/auth")

	// Register health check routes
	api.RegisterHealthCheckRoutes(router, healthCheckHandler)
	log.Println("Registered health check routes: /health, /health/ready, /health/live")

	log.Println("Authentication configured for session-only (offline mode)")

	// Protected routes with session authentication only
	apiV2 := router.Group("/api/v2")
	apiV2.Use(authMiddleware.SessionAuth())
	apiV2.Use(securityMiddleware.SessionProtection()) // Session-based protection for session-based requests
	{
		// Admin user management routes
		adminRoutes := apiV2.Group("/admin")
		adminRoutes.Use(authMiddleware.RequirePermission("admin:users"))
		{
			adminRoutes.GET("/users", apiHandler.ListUsersGin)
			adminRoutes.POST("/users", apiHandler.CreateUserGin)
			adminRoutes.GET("/users/:userId", apiHandler.GetUserGin)
			adminRoutes.PUT("/users/:userId", apiHandler.UpdateUserGin)
			adminRoutes.DELETE("/users/:userId", apiHandler.DeleteUserGin)
		}

		// Current user routes (authenticated users)
		apiV2.GET("/me", authHandler.Me)
		apiV2.GET("/auth/permissions", authHandler.GetPermissions)  // New permissions endpoint
		apiV2.POST("/change-password", authHandler.ChangePassword)

		// Persona routes with permission-based access control
		personaGroup := apiV2.Group("/personas")
		{
			// Unified persona endpoints (preferred)
			personaGroup.GET("", authMiddleware.RequirePermission("personas:read"), apiHandler.ListAllPersonasGin)
			personaGroup.POST("", authMiddleware.RequirePermission("personas:create"), apiHandler.CreatePersonaGin)
			personaGroup.GET("/:id", authMiddleware.RequirePermission("personas:read"), apiHandler.GetPersonaByIDGin)
			personaGroup.PUT("/:id", authMiddleware.RequirePermission("personas:update"), apiHandler.UpdatePersonaGin)
			personaGroup.DELETE("/:id", authMiddleware.RequirePermission("personas:delete"), apiHandler.DeletePersonaGin)
			personaGroup.POST("/:id/test", authMiddleware.RequirePermission("personas:read"), apiHandler.TestPersonaGin)

			// Type-specific endpoints (backward compatibility)
			dnsPersonaGroup := personaGroup.Group("/dns")
			{
				dnsPersonaGroup.POST("", authMiddleware.RequirePermission("personas:create"), apiHandler.CreateDNSPersonaGin)
				dnsPersonaGroup.GET("", authMiddleware.RequirePermission("personas:read"), apiHandler.ListDNSPersonasGin)
				dnsPersonaGroup.PUT("/:personaId", authMiddleware.RequirePermission("personas:update"), apiHandler.UpdateDNSPersonaGin)
				dnsPersonaGroup.DELETE("/:personaId", authMiddleware.RequirePermission("personas:delete"), apiHandler.DeleteDNSPersonaGin)
			}
			httpPersonaGroup := personaGroup.Group("/http")
			{
				httpPersonaGroup.POST("", authMiddleware.RequirePermission("personas:create"), apiHandler.CreateHTTPPersonaGin)
				httpPersonaGroup.GET("", authMiddleware.RequirePermission("personas:read"), apiHandler.ListHTTPPersonasGin)
				httpPersonaGroup.PUT("/:personaId", authMiddleware.RequirePermission("personas:update"), apiHandler.UpdateHTTPPersonaGin)
				httpPersonaGroup.DELETE("/:personaId", authMiddleware.RequirePermission("personas:delete"), apiHandler.DeleteHTTPPersonaGin)
			}
		}

		// Proxy routes with permission-based access control
		proxyGroup := apiV2.Group("/proxies")
		{
			proxyGroup.GET("", authMiddleware.RequirePermission("proxies:read"), apiHandler.ListProxiesGin)
			proxyGroup.POST("", authMiddleware.RequirePermission("proxies:create"), apiHandler.AddProxyGin)
			proxyGroup.GET("/status", authMiddleware.RequirePermission("proxies:read"), apiHandler.GetProxyStatusesGin)
			proxyGroup.PUT("/:proxyId", authMiddleware.RequirePermission("proxies:update"), apiHandler.UpdateProxyGin)
			proxyGroup.DELETE("/:proxyId", authMiddleware.RequirePermission("proxies:delete"), apiHandler.DeleteProxyGin)
			proxyGroup.POST("/:proxyId/test", authMiddleware.RequirePermission("proxies:read"), apiHandler.TestProxyGin)
			proxyGroup.POST("/:proxyId/health-check", authMiddleware.RequirePermission("proxies:read"), apiHandler.ForceCheckSingleProxyGin)
			proxyGroup.POST("/health-check", authMiddleware.RequirePermission("proxies:read"), apiHandler.ForceCheckAllProxiesGin)
		}

		// Configuration routes (admin only)
		configGroup := apiV2.Group("/config")
		configGroup.Use(authMiddleware.RequirePermission("system:config"))
		{
			configGroup.GET("/dns", apiHandler.GetDNSConfigGin)
			configGroup.POST("/dns", apiHandler.UpdateDNSConfigGin)
			configGroup.GET("/http", apiHandler.GetHTTPConfigGin)
			configGroup.POST("/http", apiHandler.UpdateHTTPConfigGin)
			configGroup.GET("/logging", apiHandler.GetLoggingConfigGin)
			configGroup.POST("/logging", apiHandler.UpdateLoggingConfigGin)
			configGroup.GET("/server", apiHandler.GetServerConfigGin)
			configGroup.PUT("/server", apiHandler.UpdateServerConfigGin)
		}

		// Keyword set routes with permission-based access control
		keywordSetGroup := apiV2.Group("/keywords/sets")
		{
			keywordSetGroup.POST("", authMiddleware.RequirePermission("campaigns:create"), apiHandler.CreateKeywordSetGin)
			keywordSetGroup.GET("", authMiddleware.RequirePermission("campaigns:read"), apiHandler.ListKeywordSetsGin)
			keywordSetGroup.GET("/:setId", authMiddleware.RequirePermission("campaigns:read"), apiHandler.GetKeywordSetGin)
			keywordSetGroup.PUT("/:setId", authMiddleware.RequirePermission("campaigns:update"), apiHandler.UpdateKeywordSetGin)
			keywordSetGroup.DELETE("/:setId", authMiddleware.RequirePermission("campaigns:delete"), apiHandler.DeleteKeywordSetGin)
		}

		// Keyword extraction routes
		extractGroup := apiV2.Group("/extract/keywords")
		extractGroup.Use(authMiddleware.RequirePermission("campaigns:read"))
		{
			extractGroup.POST("", apiHandler.BatchExtractKeywordsGin)
			extractGroup.GET("/stream", apiHandler.StreamExtractKeywordsGin)
		}

		// Temporary test endpoint for WebSocket broadcast
		apiV2.GET("/broadcast-test", func(c *gin.Context) {
			testMessage := "WebSocket test broadcast message from server! Time: " + time.Now().String()
			if b := websocket.GetBroadcaster(); b != nil {
				b.BroadcastMessage([]byte(testMessage))
				c.JSON(http.StatusOK, gin.H{"message": "Test message broadcasted", "content": testMessage})
			} else {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Broadcaster not available"})
			}
		})
		log.Println("Registered WebSocket test broadcast route under /api/v2/broadcast-test.")

		log.Println("Legacy campaign routes under /api/v2/campaigns/* have been removed. All APIs now use /api/v2.")
	}

	// V2 Campaign routes with permission-based access control (outside v2 context)
	campaignApiV2 := router.Group("/api/v2")
	campaignApiV2.Use(authMiddleware.SessionAuth())
	campaignApiV2.Use(securityMiddleware.SessionProtection())
	newCampaignRoutesGroup := campaignApiV2.Group("/campaigns")
	campaignOrchestratorAPIHandler.RegisterCampaignOrchestrationRoutes(newCampaignRoutesGroup, authMiddleware)
	log.Println("Registered new campaign orchestration routes under /api/v2/campaigns.")

	// Use environment variable for port if set, otherwise use config
	serverPort := os.Getenv("DOMAINFLOW_PORT")
	if serverPort == "" {
		serverPort = appConfig.Server.Port
	}

	srv := &http.Server{
		Addr:    ":" + serverPort,
		Handler: router,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe: %s\n", err)
		}
	}()

	log.Printf("Server starting on %s (Gin Mode: %s)", srv.Addr, appConfig.Server.GinMode)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server and workers...")

	appCancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server and workers exited gracefully.")
}
