package services

import (
	"fmt"
	"log"
	"sync"
)

// CampaignStatus represents the status of a campaign
type CampaignStatus string

const (
	StatusPending   CampaignStatus = "pending"
	StatusQueued    CampaignStatus = "queued"
	StatusRunning   CampaignStatus = "running"
	StatusPausing   CampaignStatus = "pausing"  // FIXED: Added missing StatusPausing
	StatusPaused    CampaignStatus = "paused"
	StatusCompleted CampaignStatus = "completed"
	StatusFailed    CampaignStatus = "failed"
	StatusArchived  CampaignStatus = "archived"
	StatusCancelled CampaignStatus = "cancelled"
)

// CampaignStateMachine manages valid state transitions for campaigns
type CampaignStateMachine struct {
	transitions map[CampaignStatus][]CampaignStatus
	mu          sync.RWMutex
}

// NewCampaignStateMachine creates a new state machine with valid transitions
func NewCampaignStateMachine() *CampaignStateMachine {
	sm := &CampaignStateMachine{
		transitions: map[CampaignStatus][]CampaignStatus{
			// FIXED: Added missing transitions for business logic
			StatusPending:   {StatusQueued, StatusRunning, StatusFailed, StatusCancelled}, // Allow direct pending->failed for job failures
			StatusQueued:    {StatusRunning, StatusPausing, StatusPaused, StatusCancelled},
			StatusRunning:   {StatusPausing, StatusPaused, StatusCompleted, StatusFailed},
			StatusPausing:   {StatusPaused, StatusRunning, StatusCancelled}, // FIXED: Added missing StatusPausing transitions
			StatusPaused:    {StatusRunning, StatusCancelled, StatusArchived},
			StatusCompleted: {StatusArchived},
			StatusFailed:    {StatusQueued, StatusArchived}, // Allow retry or archive
			StatusArchived:  {}, // No transitions from archived - terminal state
			StatusCancelled: {}, // No transitions from cancelled - terminal state
		},
	}
	
	log.Printf("CampaignStateMachine: Initialized with %d status types and comprehensive transition rules", len(sm.transitions))
	return sm
}

// CanTransition checks if a transition from current to target status is valid
func (sm *CampaignStateMachine) CanTransition(current, target CampaignStatus) bool {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	validTransitions, exists := sm.transitions[current]
	if !exists {
		log.Printf("CampaignStateMachine: UNKNOWN STATUS '%s' - not found in transition rules", current)
		return false
	}

	for _, valid := range validTransitions {
		if valid == target {
			log.Printf("CampaignStateMachine: VALID transition '%s' → '%s'", current, target)
			return true
		}
	}
	
	log.Printf("CampaignStateMachine: INVALID transition '%s' → '%s'. Valid transitions from '%s': %v",
		current, target, current, validTransitions)
	return false
}

// ValidateTransition returns an error if the transition is invalid
func (sm *CampaignStateMachine) ValidateTransition(current, target CampaignStatus) error {
	log.Printf("CampaignStateMachine: Validating transition '%s' → '%s'", current, target)
	
	if !sm.CanTransition(current, target) {
		errMsg := fmt.Sprintf("invalid state transition from %s to %s", current, target)
		log.Printf("CampaignStateMachine: VALIDATION FAILED - %s", errMsg)
		return fmt.Errorf(errMsg)
	}
	
	log.Printf("CampaignStateMachine: VALIDATION PASSED - transition '%s' → '%s' is allowed", current, target)
	return nil
}

// GetValidTransitions returns all valid transitions from the current status
func (sm *CampaignStateMachine) GetValidTransitions(current CampaignStatus) []CampaignStatus {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	if transitions, exists := sm.transitions[current]; exists {
		// Return a copy to prevent external modification
		result := make([]CampaignStatus, len(transitions))
		copy(result, transitions)
		return result
	}
	return []CampaignStatus{}
}

// IsTerminalState checks if a status is a terminal state (no further transitions)
func (sm *CampaignStateMachine) IsTerminalState(status CampaignStatus) bool {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	transitions, exists := sm.transitions[status]
	return exists && len(transitions) == 0
}

// StateMachineHook represents a function to be called on state transitions
type StateMachineHook func(campaignID string, from, to CampaignStatus) error

// TransitionWithHooks performs a state transition with pre and post hooks
type TransitionManager struct {
	stateMachine *CampaignStateMachine
	preHooks     []StateMachineHook
	postHooks    []StateMachineHook
	mu           sync.Mutex
}

// NewTransitionManager creates a new transition manager
func NewTransitionManager(sm *CampaignStateMachine) *TransitionManager {
	return &TransitionManager{
		stateMachine: sm,
		preHooks:     []StateMachineHook{},
		postHooks:    []StateMachineHook{},
	}
}

// AddPreHook adds a hook to be called before a transition
func (tm *TransitionManager) AddPreHook(hook StateMachineHook) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	tm.preHooks = append(tm.preHooks, hook)
}

// AddPostHook adds a hook to be called after a transition
func (tm *TransitionManager) AddPostHook(hook StateMachineHook) {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	tm.postHooks = append(tm.postHooks, hook)
}

// ExecuteTransition performs a state transition with all hooks
func (tm *TransitionManager) ExecuteTransition(campaignID string, from, to CampaignStatus) error {
	// Validate transition
	if err := tm.stateMachine.ValidateTransition(from, to); err != nil {
		return err
	}

	// Execute pre-hooks
	tm.mu.Lock()
	preHooks := make([]StateMachineHook, len(tm.preHooks))
	copy(preHooks, tm.preHooks)
	tm.mu.Unlock()

	for _, hook := range preHooks {
		if err := hook(campaignID, from, to); err != nil {
			return fmt.Errorf("pre-hook failed: %w", err)
		}
	}

	// State transition would happen here in the actual implementation
	// This is where you would update the database

	// Execute post-hooks
	tm.mu.Lock()
	postHooks := make([]StateMachineHook, len(tm.postHooks))
	copy(postHooks, tm.postHooks)
	tm.mu.Unlock()

	for _, hook := range postHooks {
		if err := hook(campaignID, from, to); err != nil {
			// Log error but don't fail the transition
			// Post-hooks should not affect the transition outcome
			fmt.Printf("post-hook error (non-fatal): %v\n", err)
		}
	}

	return nil
}
