package models

import (
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestDereferenceGeneratedDomainSlice(t *testing.T) {
	campaignID := uuid.New()
	now := time.Now()

	tests := []struct {
		name  string
		slice []*GeneratedDomain
		want  []GeneratedDomain
	}{
		{
			name:  "nil slice",
			slice: nil,
			want:  nil,
		},
		{
			name:  "empty slice",
			slice: []*GeneratedDomain{},
			want:  []GeneratedDomain{},
		},
		{
			name: "slice with non-nil elements",
			slice: []*GeneratedDomain{
				{ID: uuid.New(), GenerationCampaignID: campaignID, DomainName: "test1.com", OffsetIndex: 1, GeneratedAt: now},
				{ID: uuid.New(), GenerationCampaignID: campaignID, DomainName: "test2.com", OffsetIndex: 2, GeneratedAt: now},
			},
			want: []GeneratedDomain{
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), GenerationCampaignID: campaignID, DomainName: "test1.com", OffsetIndex: 1, GeneratedAt: now}, // ID will be overwritten by the actual one from slice
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), GenerationCampaignID: campaignID, DomainName: "test2.com", OffsetIndex: 2, GeneratedAt: now}, // ID will be overwritten
			},
		},
		{
			name: "slice with mixed nil and non-nil elements",
			slice: []*GeneratedDomain{
				{ID: uuid.New(), GenerationCampaignID: campaignID, DomainName: "test1.com", OffsetIndex: 1, GeneratedAt: now},
				nil,
				{ID: uuid.New(), GenerationCampaignID: campaignID, DomainName: "test3.com", OffsetIndex: 3, GeneratedAt: now},
				nil,
			},
			want: []GeneratedDomain{
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), GenerationCampaignID: campaignID, DomainName: "test1.com", OffsetIndex: 1, GeneratedAt: now},
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), GenerationCampaignID: campaignID, DomainName: "test3.com", OffsetIndex: 3, GeneratedAt: now},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Adjust IDs for "want" based on "slice" for comparable non-nil elements
			if tt.name == "slice with non-nil elements" || tt.name == "slice with mixed nil and non-nil elements" {
				wantIndex := 0
				for i := range tt.slice {
					if tt.slice[i] != nil && wantIndex < len(tt.want) {
						tt.want[wantIndex].ID = tt.slice[i].ID // Align IDs for proper comparison
						wantIndex++
					}
				}
			}

			got := DereferenceGeneratedDomainSlice(tt.slice)
			if !reflect.DeepEqual(got, tt.want) {
				// Handle nil vs empty slice for reflect.DeepEqual
				if (len(got) == 0 && len(tt.want) == 0) && (got == nil && tt.want != nil || got != nil && tt.want == nil) {
					// This is fine, reflect.DeepEqual considers nil and empty slice different
				} else {
					t.Errorf("DereferenceGeneratedDomainSlice() = %v, want %v", got, tt.want)
				}
			}
		})
	}
}

func TestDereferenceDNSValidationResultSlice(t *testing.T) {
	dnsCampaignID := uuid.New()

	tests := []struct {
		name  string
		slice []*DNSValidationResult
		want  []DNSValidationResult
	}{
		{
			name:  "nil slice",
			slice: nil,
			want:  nil,
		},
		{
			name:  "empty slice",
			slice: []*DNSValidationResult{},
			want:  []DNSValidationResult{},
		},
		{
			name: "slice with non-nil elements",
			slice: []*DNSValidationResult{
				{ID: uuid.New(), DNSCampaignID: dnsCampaignID, DomainName: "test1.com", ValidationStatus: "VALID"},
				{ID: uuid.New(), DNSCampaignID: dnsCampaignID, DomainName: "test2.com", ValidationStatus: "INVALID"},
			},
			want: []DNSValidationResult{
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), DNSCampaignID: dnsCampaignID, DomainName: "test1.com", ValidationStatus: "VALID"},
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), DNSCampaignID: dnsCampaignID, DomainName: "test2.com", ValidationStatus: "INVALID"},
			},
		},
		{
			name: "slice with mixed nil and non-nil elements",
			slice: []*DNSValidationResult{
				{ID: uuid.New(), DNSCampaignID: dnsCampaignID, DomainName: "test1.com", ValidationStatus: "VALID"},
				nil,
				{ID: uuid.New(), DNSCampaignID: dnsCampaignID, DomainName: "test3.com", ValidationStatus: "PENDING"},
			},
			want: []DNSValidationResult{
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), DNSCampaignID: dnsCampaignID, DomainName: "test1.com", ValidationStatus: "VALID"},
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), DNSCampaignID: dnsCampaignID, DomainName: "test3.com", ValidationStatus: "PENDING"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.name == "slice with non-nil elements" || tt.name == "slice with mixed nil and non-nil elements" {
				wantIndex := 0
				for i := range tt.slice {
					if tt.slice[i] != nil && wantIndex < len(tt.want) {
						tt.want[wantIndex].ID = tt.slice[i].ID
						wantIndex++
					}
				}
			}
			got := DereferenceDNSValidationResultSlice(tt.slice)
			if !reflect.DeepEqual(got, tt.want) {
				if (len(got) == 0 && len(tt.want) == 0) && (got == nil && tt.want != nil || got != nil && tt.want == nil) {
					// Reflect.DeepEqual treats nil slice and empty slice differently.
				} else {
					t.Errorf("DereferenceDNSValidationResultSlice() = %v, want %v", got, tt.want)
				}
			}
		})
	}
}

func TestDereferenceHTTPKeywordResultSlice(t *testing.T) {
	httpCampaignID := uuid.New()

	tests := []struct {
		name  string
		slice []*HTTPKeywordResult
		want  []HTTPKeywordResult
	}{
		{
			name:  "nil slice",
			slice: nil,
			want:  nil,
		},
		{
			name:  "empty slice",
			slice: []*HTTPKeywordResult{},
			want:  []HTTPKeywordResult{},
		},
		{
			name: "slice with non-nil elements",
			slice: []*HTTPKeywordResult{
				{ID: uuid.New(), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test1.com", ValidationStatus: "FOUND"},
				{ID: uuid.New(), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test2.com", ValidationStatus: "NOT_FOUND"},
			},
			want: []HTTPKeywordResult{
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test1.com", ValidationStatus: "FOUND"},
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test2.com", ValidationStatus: "NOT_FOUND"},
			},
		},
		{
			name: "slice with mixed nil and non-nil elements",
			slice: []*HTTPKeywordResult{
				{ID: uuid.New(), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test1.com", ValidationStatus: "ERROR"},
				nil,
				{ID: uuid.New(), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test3.com", ValidationStatus: "FOUND"},
			},
			want: []HTTPKeywordResult{
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test1.com", ValidationStatus: "ERROR"},
				{ID: uuid.MustParse("00000000-0000-0000-0000-000000000000"), HTTPKeywordCampaignID: httpCampaignID, DomainName: "test3.com", ValidationStatus: "FOUND"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.name == "slice with non-nil elements" || tt.name == "slice with mixed nil and non-nil elements" {
				wantIndex := 0
				for i := range tt.slice {
					if tt.slice[i] != nil && wantIndex < len(tt.want) {
						tt.want[wantIndex].ID = tt.slice[i].ID
						wantIndex++
					}
				}
			}
			got := DereferenceHTTPKeywordResultSlice(tt.slice)
			if !reflect.DeepEqual(got, tt.want) {
				if (len(got) == 0 && len(tt.want) == 0) && (got == nil && tt.want != nil || got != nil && tt.want == nil) {
					// Reflect.DeepEqual treats nil slice and empty slice differently.
				} else {
					t.Errorf("DereferenceHTTPKeywordResultSlice() = %v, want %v", got, tt.want)
				}
			}
		})
	}
}
