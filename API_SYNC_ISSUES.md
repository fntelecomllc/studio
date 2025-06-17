# API Synchronization Issues

This document outlines the identified synchronization issues between the frontend and backend API and WebSocket layers.

## 1. REST API Issues

### 1.1. Campaign Creation Payload Mismatches

There are several discrepancies between the frontend's `CreateCampaignPayload` and the backend's expected request structures for creating campaigns.

*   **Issue:** The frontend's `campaignService.production.ts` contains `mapTo...Request` functions that transform the frontend's data model into the backend's expected model. This indicates that the two models are not in sync.
*   **Example:** In `mapToDNSRequest`, the frontend payload has `assignedDnsPersonaId`, but the backend expects `personaIds` (an array). The mapping function handles this, but it's a sign of divergence.
*   **Recommendation:** The frontend and backend models should be unified to eliminate the need for these mapping functions.
*   **Status: Done**

### 1.2. Unused API Endpoints

The analysis revealed that some backend API endpoints are not explicitly used by the frontend services I inspected.

*   **Endpoints:**
    *   `GET /api/v2/campaigns/:campaignId/status`
    *   `PUT /api/v2/campaigns/:campaignId`
*   **Recommendation:** These endpoints should be reviewed. If they are no longer needed, they should be deprecated and removed to reduce the API surface area.
*   **Status: Done**

## 2. WebSocket Issues

### 2.1. Missing Production WebSocket Service

*   **Issue:** The file `src/lib/services/websocketService.production.ts` is empty, while `src/lib/services/websocketService.simple.ts` contains the actual implementation.
*   **Recommendation:** The code from `websocketService.simple.ts` should be moved to `websocketService.production.ts`, and the `simple` file should be removed to avoid confusion.
*   **Status: Done**

### 2.2. Inconsistent WebSocket Message Structures

There are inconsistencies between the WebSocket message structures defined in the backend and the frontend.

*   **Backend (`client.go`):**
    ```go
    type WebSocketMessage struct {
        ID             string      `json:"id"`
        Timestamp      string      `json:"timestamp"`
        Type           string      `json:"type"`
        SequenceNumber int64       `json:"sequenceNumber"`
        Data           interface{} `json:"data,omitempty"`
        Payload        interface{} `json:"payload,omitempty"`
        Message        string      `json:"message,omitempty"`
        CampaignID     string      `json:"campaignId,omitempty"`
        Phase          string      `json:"phase,omitempty"`
        Status         string      `json:"status,omitempty"`
        Progress       float64     `json:"progress,omitempty"`
    }
    ```
*   **Frontend (`websocketService.simple.ts`):**
    ```typescript
    export interface WebSocketMessage {
      type: string;
      campaignId?: string;
      data?: unknown;
      timestamp?: string;
    }
    ```
*   **Recommendation:** The frontend's `WebSocketMessage` interface should be updated to match the backend's definition to ensure all fields are correctly typed and handled.
*   **Status: Done**

## 3. Data Model Divergence

The `src/lib/types.ts` file contains many "legacy" and "compatibility" fields, indicating that the frontend and backend data models have diverged over time.

*   **Example:** The `Campaign` interface in `types.ts` has numerous fields that are not present in the backend's `Campaign` struct, such as `selectedType`, `currentPhase`, and `phaseStatus`.
*   **Recommendation:** A comprehensive effort should be made to unify the frontend and backend data models. This will reduce complexity, eliminate the need for data mapping/transformation, and prevent future synchronization issues.
*   **Status: Done**