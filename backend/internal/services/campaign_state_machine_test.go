package services

import (
	"testing"
)

func TestCampaignStateMachine(t *testing.T) {
	sm := NewCampaignStateMachine()

	tests := []struct {
		name     string
		from     CampaignStatus
		to       CampaignStatus
		expected bool
	}{
		// Valid transitions
		{"pending to queued", StatusPending, StatusQueued, true},
		{"pending to cancelled", StatusPending, StatusCancelled, true},
		{"queued to running", StatusQueued, StatusRunning, true},
		{"queued to paused", StatusQueued, StatusPaused, true},
		{"queued to cancelled", StatusQueued, StatusCancelled, true},
		{"running to paused", StatusRunning, StatusPaused, true},
		{"running to completed", StatusRunning, StatusCompleted, true},
		{"running to failed", StatusRunning, StatusFailed, true},
		{"paused to running", StatusPaused, StatusRunning, true},
		{"paused to cancelled", StatusPaused, StatusCancelled, true},
		{"completed to archived", StatusCompleted, StatusArchived, true},
		{"failed to queued", StatusFailed, StatusQueued, true},
		{"failed to archived", StatusFailed, StatusArchived, true},

		// Invalid transitions
		{"pending to running", StatusPending, StatusRunning, false},
		{"pending to completed", StatusPending, StatusCompleted, false},
		{"queued to completed", StatusQueued, StatusCompleted, false},
		{"running to queued", StatusRunning, StatusQueued, false},
		{"completed to running", StatusCompleted, StatusRunning, false},
		{"archived to any", StatusArchived, StatusRunning, false},
		{"cancelled to any", StatusCancelled, StatusRunning, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sm.CanTransition(tt.from, tt.to)
			if result != tt.expected {
				t.Errorf("CanTransition(%s, %s) = %v, want %v", tt.from, tt.to, result, tt.expected)
			}
		})
	}
}

func TestGetValidTransitions(t *testing.T) {
	sm := NewCampaignStateMachine()

	tests := []struct {
		status   CampaignStatus
		expected []CampaignStatus
	}{
		{StatusPending, []CampaignStatus{StatusQueued, StatusCancelled}},
		{StatusQueued, []CampaignStatus{StatusRunning, StatusPaused, StatusCancelled}},
		{StatusRunning, []CampaignStatus{StatusPaused, StatusCompleted, StatusFailed}},
		{StatusPaused, []CampaignStatus{StatusRunning, StatusCancelled}},
		{StatusCompleted, []CampaignStatus{StatusArchived}},
		{StatusFailed, []CampaignStatus{StatusQueued, StatusArchived}},
		{StatusArchived, []CampaignStatus{}},
		{StatusCancelled, []CampaignStatus{}},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			result := sm.GetValidTransitions(tt.status)
			if len(result) != len(tt.expected) {
				t.Errorf("GetValidTransitions(%s) returned %d transitions, want %d", tt.status, len(result), len(tt.expected))
				return
			}
			for i, status := range result {
				if status != tt.expected[i] {
					t.Errorf("GetValidTransitions(%s)[%d] = %s, want %s", tt.status, i, status, tt.expected[i])
				}
			}
		})
	}
}

func TestIsTerminalState(t *testing.T) {
	sm := NewCampaignStateMachine()

	tests := []struct {
		status     CampaignStatus
		isTerminal bool
	}{
		{StatusPending, false},
		{StatusQueued, false},
		{StatusRunning, false},
		{StatusPaused, false},
		{StatusCompleted, false},
		{StatusFailed, false},
		{StatusArchived, true},
		{StatusCancelled, true},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			result := sm.IsTerminalState(tt.status)
			if result != tt.isTerminal {
				t.Errorf("IsTerminalState(%s) = %v, want %v", tt.status, result, tt.isTerminal)
			}
		})
	}
}

func TestTransitionManager(t *testing.T) {
	sm := NewCampaignStateMachine()
	tm := NewTransitionManager(sm)

	// Test pre-hook
	preHookCalled := false
	tm.AddPreHook(func(campaignID string, from, to CampaignStatus) error {
		preHookCalled = true
		if campaignID != "test-campaign" {
			t.Errorf("Expected campaignID 'test-campaign', got '%s'", campaignID)
		}
		if from != StatusPending || to != StatusQueued {
			t.Errorf("Expected transition from %s to %s, got from %s to %s", StatusPending, StatusQueued, from, to)
		}
		return nil
	})

	// Test post-hook
	postHookCalled := false
	tm.AddPostHook(func(campaignID string, from, to CampaignStatus) error {
		postHookCalled = true
		return nil
	})

	// Execute valid transition
	err := tm.ExecuteTransition("test-campaign", StatusPending, StatusQueued)
	if err != nil {
		t.Errorf("ExecuteTransition failed: %v", err)
	}

	if !preHookCalled {
		t.Error("Pre-hook was not called")
	}
	if !postHookCalled {
		t.Error("Post-hook was not called")
	}

	// Test invalid transition
	err = tm.ExecuteTransition("test-campaign", StatusPending, StatusCompleted)
	if err == nil {
		t.Error("Expected error for invalid transition, got nil")
	}
}
