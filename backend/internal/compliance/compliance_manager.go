// Phase 6.4: Compliance Requirements Mapping

package compliance

import (
	"fmt"
	"time"
)

// ComplianceFramework represents different compliance standards
type ComplianceFramework string

const (
	FrameworkSOC2     ComplianceFramework = "SOC2"
	FrameworkISO27001 ComplianceFramework = "ISO27001"
	FrameworkGDPR     ComplianceFramework = "GDPR"
	FrameworkHIPAA    ComplianceFramework = "HIPAA"
	FrameworkNIST     ComplianceFramework = "NIST-800-63B"
	FrameworkOWASP    ComplianceFramework = "OWASP"
	FrameworkSOX      ComplianceFramework = "SOX"
)

// ComplianceStatus represents the compliance status for a requirement
type ComplianceStatus string

const (
	StatusCompliant     ComplianceStatus = "compliant"
	StatusPartial       ComplianceStatus = "partial"
	StatusNonCompliant  ComplianceStatus = "non_compliant"
	StatusNotApplicable ComplianceStatus = "not_applicable"
)

// ComplianceRequirement represents a specific compliance requirement
type ComplianceRequirement struct {
	ID          string               `json:"id"`
	Framework   ComplianceFramework  `json:"framework"`
	Category    string               `json:"category"`
	Requirement string               `json:"requirement"`
	Description string               `json:"description"`
	Status      ComplianceStatus     `json:"status"`
	Evidence    []ComplianceEvidence `json:"evidence"`
	LastAudited time.Time            `json:"lastAudited"`
	NextAudit   time.Time            `json:"nextAudit"`
}

// ComplianceEvidence represents evidence for compliance
type ComplianceEvidence struct {
	Type        string    `json:"type"`
	Description string    `json:"description"`
	Location    string    `json:"location"`
	CollectedAt time.Time `json:"collectedAt"`
	CollectedBy string    `json:"collectedBy"`
}

// ComplianceManager manages compliance requirements
type ComplianceManager struct {
	requirements map[string]*ComplianceRequirement
}

// NewComplianceManager creates a new compliance manager
func NewComplianceManager() *ComplianceManager {
	cm := &ComplianceManager{
		requirements: make(map[string]*ComplianceRequirement),
	}
	cm.initializeRequirements()
	return cm
}

// initializeRequirements sets up all compliance requirements
func (cm *ComplianceManager) initializeRequirements() {
	// SOC2 Requirements
	cm.addRequirement(&ComplianceRequirement{
		ID:          "SOC2-SEC-001",
		Framework:   FrameworkSOC2,
		Category:    "Security",
		Requirement: "Data Encryption",
		Description: "Sensitive data must be encrypted at rest and in transit",
		Status:      StatusCompliant,
		Evidence: []ComplianceEvidence{
			{
				Type:        "implementation",
				Description: "TLS 1.3 for data in transit, AES-256 for data at rest",
				Location:    "backend/internal/services/encryption_service.go",
				CollectedAt: time.Now(),
			},
		},
	})

	// ISO 27001 Requirements
	cm.addRequirement(&ComplianceRequirement{
		ID:          "ISO27001-A.9.1.2",
		Framework:   FrameworkISO27001,
		Category:    "Access Control",
		Requirement: "Access to networks and network services",
		Description: "Users should only be provided with access to the network and network services that they have been specifically authorized to use",
		Status:      StatusCompliant,
		Evidence: []ComplianceEvidence{
			{
				Type:        "implementation",
				Description: "Role-based access control implemented",
				Location:    "backend/internal/middleware/auth_middleware.go",
				CollectedAt: time.Now(),
			},
		},
	})

	// GDPR Requirements
	cm.addRequirement(&ComplianceRequirement{
		ID:          "GDPR-ART-32",
		Framework:   FrameworkGDPR,
		Category:    "Security of Processing",
		Requirement: "Security of personal data",
		Description: "Implementation of appropriate technical and organizational measures to ensure security appropriate to the risk",
		Status:      StatusCompliant,
		Evidence: []ComplianceEvidence{
			{
				Type:        "implementation",
				Description: "Field-level encryption for PII",
				Location:    "backend/database/migrations/000015_add_field_encryption.up.sql",
				CollectedAt: time.Now(),
			},
		},
	})

	// NIST 800-63B Requirements
	cm.addRequirement(&ComplianceRequirement{
		ID:          "NIST-800-63B-5.1.1",
		Framework:   FrameworkNIST,
		Category:    "Authentication",
		Requirement: "Password Complexity",
		Description: "Memorized secrets SHALL be at least 8 characters in length",
		Status:      StatusPartial,
		Evidence: []ComplianceEvidence{
			{
				Type:        "policy",
				Description: "Password policy enforces minimum 12 characters",
				Location:    "backend/internal/services/auth_service.go",
				CollectedAt: time.Now(),
			},
		},
	})

	// OWASP Requirements
	cm.addRequirement(&ComplianceRequirement{
		ID:          "OWASP-V2.1.1",
		Framework:   FrameworkOWASP,
		Category:    "Authentication",
		Requirement: "Session Management",
		Description: "Verify that user sessions are invalidated when the user logs out",
		Status:      StatusCompliant,
		Evidence: []ComplianceEvidence{
			{
				Type:        "implementation",
				Description: "Session invalidation on logout",
				Location:    "backend/internal/services/auth_service.go",
				CollectedAt: time.Now(),
			},
		},
	})

	// SOX Requirements
	cm.addRequirement(&ComplianceRequirement{
		ID:          "SOX-404",
		Framework:   FrameworkSOX,
		Category:    "Internal Controls",
		Requirement: "Audit Trail",
		Description: "Maintain audit trail of all financial and access control activities",
		Status:      StatusCompliant,
		Evidence: []ComplianceEvidence{
			{
				Type:        "implementation",
				Description: "Comprehensive audit logging system",
				Location:    "backend/internal/models/models.go#AuditLog",
				CollectedAt: time.Now(),
			},
		},
	})
}

// addRequirement adds a compliance requirement
func (cm *ComplianceManager) addRequirement(req *ComplianceRequirement) {
	cm.requirements[req.ID] = req
}

// GetRequirementsByFramework returns all requirements for a framework
func (cm *ComplianceManager) GetRequirementsByFramework(framework ComplianceFramework) []*ComplianceRequirement {
	var requirements []*ComplianceRequirement
	for _, req := range cm.requirements {
		if req.Framework == framework {
			requirements = append(requirements, req)
		}
	}
	return requirements
}

// GetComplianceReport generates a compliance report
func (cm *ComplianceManager) GetComplianceReport() *ComplianceReport {
	report := &ComplianceReport{
		GeneratedAt: time.Now(),
		Summary:     make(map[ComplianceFramework]*FrameworkSummary),
	}

	// Calculate compliance by framework
	frameworks := map[ComplianceFramework]bool{}
	for _, req := range cm.requirements {
		frameworks[req.Framework] = true
	}

	for framework := range frameworks {
		summary := &FrameworkSummary{
			Framework: framework,
		}

		for _, req := range cm.requirements {
			if req.Framework == framework {
				summary.Total++
				switch req.Status {
				case StatusCompliant:
					summary.Compliant++
				case StatusPartial:
					summary.Partial++
				case StatusNonCompliant:
					summary.NonCompliant++
				case StatusNotApplicable:
					summary.NotApplicable++
				}
			}
		}

		summary.CompliancePercentage = float64(summary.Compliant) / float64(summary.Total) * 100
		report.Summary[framework] = summary
	}

	return report
}

// ComplianceReport represents a compliance status report
type ComplianceReport struct {
	GeneratedAt time.Time                                 `json:"generatedAt"`
	Summary     map[ComplianceFramework]*FrameworkSummary `json:"summary"`
}

// FrameworkSummary represents compliance summary for a framework
type FrameworkSummary struct {
	Framework            ComplianceFramework `json:"framework"`
	Total                int                 `json:"total"`
	Compliant            int                 `json:"compliant"`
	Partial              int                 `json:"partial"`
	NonCompliant         int                 `json:"nonCompliant"`
	NotApplicable        int                 `json:"notApplicable"`
	CompliancePercentage float64             `json:"compliancePercentage"`
}

// ValidateCompliance validates compliance for a specific action
func (cm *ComplianceManager) ValidateCompliance(action string, context map[string]interface{}) error {
	// Check relevant compliance requirements based on action
	switch action {
	case "data_encryption":
		if req, exists := cm.requirements["SOC2-SEC-001"]; exists {
			if req.Status != StatusCompliant {
				return fmt.Errorf("data encryption not compliant with SOC2 requirements")
			}
		}
	case "user_authentication":
		if req, exists := cm.requirements["NIST-800-63B-5.1.1"]; exists {
			if req.Status == StatusNonCompliant {
				return fmt.Errorf("authentication does not meet NIST requirements")
			}
		}
	}
	return nil
}

// RecordComplianceEvent records a compliance-related event
func (cm *ComplianceManager) RecordComplianceEvent(event *ComplianceEvent) {
	// In a real implementation, this would persist to database
	// For now, we'll just validate the event
	if event.RequirementID != "" {
		if req, exists := cm.requirements[event.RequirementID]; exists {
			req.LastAudited = time.Now()
		}
	}
}

// ComplianceEvent represents a compliance-related event
type ComplianceEvent struct {
	ID            string    `json:"id"`
	RequirementID string    `json:"requirementId"`
	EventType     string    `json:"eventType"`
	Description   string    `json:"description"`
	Actor         string    `json:"actor"`
	Timestamp     time.Time `json:"timestamp"`
	Result        string    `json:"result"`
}
