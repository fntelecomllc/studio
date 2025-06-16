// File: backend/internal/api/keyword_extraction_handlers.go
package api

import (
	"context"
	//"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	//"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/contentfetcher"
	"github.com/fntelecomllc/studio/backend/internal/keywordextractor"
	"github.com/fntelecomllc/studio/backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func (h *APIHandler) BatchExtractKeywordsGin(c *gin.Context) {
	var req BatchKeywordExtractionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}
	// Validate the request DTO (assuming global 'validate' is initialized)
	if err := validate.Struct(req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Request validation failed: "+err.Error())
		return
	}

	if len(req.Items) == 0 {
		respondWithErrorGin(c, http.StatusBadRequest, "No items provided for extraction")
		return
	}

	log.Printf("BatchExtractKeywordsGin: Received %d items for keyword extraction.", len(req.Items))

	cf := contentfetcher.NewContentFetcher(h.Config, h.ProxyMgr)
	results := make([]KeywordExtractionAPIResult, len(req.Items))
	var wg sync.WaitGroup

	concurrency := h.Config.Worker.NumWorkers // Use configured worker num as concurrency limit for batch
	if concurrency <= 0 {
		concurrency = 5 // Fallback concurrency
	}
	semaphore := make(chan struct{}, concurrency)
	batchTimeout := time.Duration(len(req.Items)*h.Config.Worker.JobProcessingTimeoutMinutes) * time.Minute // Use configured timeout
	if batchTimeout <= 0 {
		batchTimeout = time.Duration(len(req.Items)*15) * time.Minute // Fallback timeout
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), batchTimeout)
	defer cancel()

	for i, item := range req.Items {
		select {
		case <-ctx.Done():
			log.Printf("BatchExtractKeywordsGin: Context cancelled before processing item %d (%s): %v", i, item.URL, ctx.Err())
			for j := i; j < len(req.Items); j++ {
				results[j] = KeywordExtractionAPIResult{
					URL:              req.Items[j].URL,
					KeywordSetIDUsed: req.Items[j].KeywordSetID,
					Error:            fmt.Sprintf("Batch processing cancelled: %v", ctx.Err()),
				}
			}
			goto sendResponseGin
		default:
		}

		wg.Add(1)
		semaphore <- struct{}{}
		go func(idx int, currentItem KeywordExtractionRequestItem) {
			defer wg.Done()
			defer func() { <-semaphore }()

			jobCtx := ctx // Use the batch context, could also create per-item sub-context with shorter timeout
			itemResult := KeywordExtractionAPIResult{
				URL:              currentItem.URL,
				KeywordSetIDUsed: currentItem.KeywordSetID,
			}

			var httpModelPersona *models.Persona
			var dnsModelPersona *models.Persona
			var modelProxy *models.Proxy // Assuming API might take a specific ProxyID string for an item

			if currentItem.HTTPPersonaID != nil {
				httpPID_uuid, pErr := uuid.Parse(*currentItem.HTTPPersonaID)
				if pErr == nil {
					p, dbErr := h.PersonaStore.GetPersonaByID(jobCtx, h.DB, httpPID_uuid) // Use h.DB
					if dbErr == nil && p.PersonaType == models.PersonaTypeHTTP {
						httpModelPersona = p
						itemResult.HTTPPersonaIDUsed = currentItem.HTTPPersonaID
					}
				}
			}
			if currentItem.DNSPersonaID != nil {
				dnsPID_uuid, pErr := uuid.Parse(*currentItem.DNSPersonaID)
				if pErr == nil {
					p, dbErr := h.PersonaStore.GetPersonaByID(jobCtx, h.DB, dnsPID_uuid) // Use h.DB
					if dbErr == nil && p.PersonaType == models.PersonaTypeDNS {
						dnsModelPersona = p
						itemResult.DNSPersonaIDUsed = currentItem.DNSPersonaID
					}
				}
			}

			keywordSetID_uuid, err := uuid.Parse(currentItem.KeywordSetID)
			if err != nil {
				itemResult.Error = fmt.Sprintf("Invalid KeywordSetID format '%s': %v", currentItem.KeywordSetID, err)
				results[idx] = itemResult
				return
			}
			kset, err := h.KeywordStore.GetKeywordSetByID(jobCtx, h.DB, keywordSetID_uuid) // Use h.DB
			if err != nil {
				itemResult.Error = fmt.Sprintf("KeywordSetID '%s' not found: %v", currentItem.KeywordSetID, err)
				results[idx] = itemResult
				return
			}
			ksetRules, err := h.KeywordStore.GetKeywordRulesBySetID(jobCtx, h.DB, kset.ID) // Use h.DB
			if err != nil || len(ksetRules) == 0 {
				itemResult.Error = fmt.Sprintf("No rules for KeywordSetID '%s' or error: %v", currentItem.KeywordSetID, err)
				results[idx] = itemResult
				return
			}

			body, finalURL, statusCode, httpPIDUsed, dnsPIDUsed, proxyIDUsed, fetchErr := cf.FetchUsingPersonas(jobCtx, currentItem.URL, httpModelPersona, dnsModelPersona, modelProxy)

			itemResult.FinalURL = finalURL
			itemResult.StatusCode = statusCode
			if httpPIDUsed != nil {
				idStr := httpPIDUsed.String()
				itemResult.HTTPPersonaIDUsed = &idStr
			}
			if dnsPIDUsed != nil {
				idStr := dnsPIDUsed.String()
				itemResult.DNSPersonaIDUsed = &idStr
			}
			if proxyIDUsed != nil {
				idStr := proxyIDUsed.String()
				itemResult.ProxyIDUsed = &idStr
			}

			if fetchErr != nil {
				itemResult.Error = fmt.Sprintf("Fetch error: %v", fetchErr)
				results[idx] = itemResult
				return
			}
			if statusCode < 200 || statusCode >= 300 {
				itemResult.Error = fmt.Sprintf("Fetch returned status %d", statusCode)
			}

			if len(body) > 0 {
				kws, kwErr := keywordextractor.ExtractKeywords(body, ksetRules)
				if kwErr != nil {
					if itemResult.Error != "" {
						itemResult.Error += "; "
					}
					itemResult.Error += fmt.Sprintf("Keyword extraction error: %v", kwErr)
				} else if len(kws) > 0 {
					itemResult.Matches = kws
				}
			} else {
				if itemResult.Error == "" {
					itemResult.Error = "No content fetched"
				}
			}
			results[idx] = itemResult
		}(i, item)
	}

	wg.Wait()

sendResponseGin:
	log.Printf("BatchExtractKeywordsGin: Completed processing for %d items.", len(req.Items))
	respondWithJSONGin(c, http.StatusOK, BatchKeywordExtractionResponse{Results: results})
}

func (h *APIHandler) StreamExtractKeywordsGin(c *gin.Context) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		respondWithErrorGin(c, http.StatusInternalServerError, "Streaming unsupported!")
		return
	}

	urlToProcess := c.Query("url")
	keywordSetIDStr := c.Query("keywordSetId")
	httpPersonaIDStr := c.Query("httpPersonaId")
	dnsPersonaIDStr := c.Query("dnsPersonaId")

	if err := validate.Var(urlToProcess, "required,url"); err != nil {
		streamErrorEventGin(c, flusher, "'url' query parameter is invalid: "+err.Error())
		return
	}
	if err := validate.Var(keywordSetIDStr, "required,uuid"); err != nil {
		streamErrorEventGin(c, flusher, "'keywordSetId' query parameter is invalid: "+err.Error())
		return
	}
	if httpPersonaIDStr != "" && validate.Var(httpPersonaIDStr, "uuid") != nil {
		streamErrorEventGin(c, flusher, "'httpPersonaId' query parameter is invalid (must be UUID)")
		return
	}
	if dnsPersonaIDStr != "" && validate.Var(dnsPersonaIDStr, "uuid") != nil {
		streamErrorEventGin(c, flusher, "'dnsPersonaId' query parameter is invalid (must be UUID)")
		return
	}

	ctx := c.Request.Context()
	cf := contentfetcher.NewContentFetcher(h.Config, h.ProxyMgr)

	itemResult := KeywordExtractionAPIResult{
		URL:              urlToProcess,
		KeywordSetIDUsed: keywordSetIDStr,
	}

	var httpModelPersona *models.Persona
	var dnsModelPersona *models.Persona

	if httpPersonaIDStr != "" {
		httpPID_uuid, _ := uuid.Parse(httpPersonaIDStr)                    // Already validated format
		p, dbErr := h.PersonaStore.GetPersonaByID(ctx, h.DB, httpPID_uuid) // Use h.DB
		if dbErr == nil && p.PersonaType == models.PersonaTypeHTTP {
			httpModelPersona = p
			itemResult.HTTPPersonaIDUsed = &httpPersonaIDStr
		}
	}
	if dnsPersonaIDStr != "" {
		dnsPID_uuid, _ := uuid.Parse(dnsPersonaIDStr)                     // Already validated format
		p, dbErr := h.PersonaStore.GetPersonaByID(ctx, h.DB, dnsPID_uuid) // Use h.DB
		if dbErr == nil && p.PersonaType == models.PersonaTypeDNS {
			dnsModelPersona = p
			itemResult.DNSPersonaIDUsed = &dnsPersonaIDStr
		}
	}

	keywordSetID_uuid, _ := uuid.Parse(keywordSetIDStr)                         // Already validated
	kset, err := h.KeywordStore.GetKeywordSetByID(ctx, h.DB, keywordSetID_uuid) // Use h.DB
	if err != nil {
		itemResult.Error = fmt.Sprintf("KeywordSetID '%s' not found: %v", keywordSetIDStr, err)
		streamResultEventGin(c, flusher, "1", itemResult)
		streamDoneEventGin(c, flusher, "Stream error")
		return
	}
	ksetRules, err := h.KeywordStore.GetKeywordRulesBySetID(ctx, h.DB, kset.ID) // Use h.DB
	if err != nil || len(ksetRules) == 0 {
		itemResult.Error = fmt.Sprintf("Error fetching or no rules for KeywordSetID '%s': %v", keywordSetIDStr, err)
		streamResultEventGin(c, flusher, "1", itemResult)
		streamDoneEventGin(c, flusher, "Stream error")
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	body, finalURL, statusCode, httpPIDUsed, dnsPIDUsed, proxyIDUsed, fetchErr := cf.FetchUsingPersonas(ctx, urlToProcess, httpModelPersona, dnsModelPersona, nil)
	itemResult.FinalURL = finalURL
	itemResult.StatusCode = statusCode
	if httpPIDUsed != nil {
		idStr := httpPIDUsed.String()
		itemResult.HTTPPersonaIDUsed = &idStr
	}
	if dnsPIDUsed != nil {
		idStr := dnsPIDUsed.String()
		itemResult.DNSPersonaIDUsed = &idStr
	}
	if proxyIDUsed != nil {
		idStr := proxyIDUsed.String()
		itemResult.ProxyIDUsed = &idStr
	}

	if fetchErr != nil {
		itemResult.Error = fmt.Sprintf("Fetch error: %v", fetchErr)
	} else if statusCode < 200 || statusCode >= 300 {
		itemResult.Error = fmt.Sprintf("Fetch returned status %d", statusCode)
	}

	if len(body) > 0 && fetchErr == nil {
		kws, kwErr := keywordextractor.ExtractKeywords(body, ksetRules)
		if kwErr != nil {
			if itemResult.Error != "" {
				itemResult.Error += "; "
			}
			itemResult.Error += fmt.Sprintf("Keyword extraction error: %v", kwErr)
		} else if len(kws) > 0 {
			itemResult.Matches = kws
		}
	} else if fetchErr == nil && itemResult.Error == "" {
		itemResult.Error = "No content fetched"
	}

	streamResultEventGin(c, flusher, "1", itemResult)
	streamDoneEventGin(c, flusher, "Keyword extraction stream completed")
	log.Printf("StreamExtractKeywordsGin: Finished request for URL %s", urlToProcess)
}

// streamResultEventGin sends a single KeywordExtractionAPIResult as an SSE event using Gin.
func streamResultEventGin(c *gin.Context, flusher http.Flusher, eventID string, result KeywordExtractionAPIResult) {
	// Check if client is still connected before attempting to write
	select {
	case <-c.Writer.CloseNotify():
		log.Printf("streamResultEventGin: Client disconnected for eventID %s, URL %s", eventID, result.URL)
		return
	default:
	}
	c.SSEvent("keyword_extraction_result", result)
	flusher.Flush()
}

// streamDoneEventGin sends the done event for SSE using Gin.
func streamDoneEventGin(c *gin.Context, flusher http.Flusher, message string) {
	select {
	case <-c.Writer.CloseNotify():
		log.Printf("streamDoneEventGin: Client disconnected before sending done event.")
		return
	default:
	}
	c.SSEvent("done", gin.H{"message": message})
	flusher.Flush()
}

/*
// streamErrorEventGin sends an error event for SSE using Gin. // This is now in handler_utils_gin.go
func streamErrorEventGin(c *gin.Context, flusher http.Flusher, errorMessage string) {
	select {
	case <-c.Writer.CloseNotify():
		log.Printf("streamErrorEventGin: Client disconnected before sending error: %s", errorMessage)
		return
	default:
	}
	c.SSEvent("error", gin.H{"error": errorMessage})
	flusher.Flush()
}
*/
