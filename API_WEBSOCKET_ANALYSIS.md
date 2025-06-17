# API & WebSocket Communication Analysis

This document provides a detailed analysis of the API and WebSocket communication layers in the DomainFlow application. It maps the flow from the frontend services to the backend handlers, providing a clear overview of the system's architecture.

## 1. REST API Analysis

The backend exposes a versioned REST API under the `/api/v2` path. The API is built using the Gin framework and uses a session-based authentication mechanism.

### 1.1. Authentication Endpoints

*   **Backend Handler:** `backend/internal/api/auth_handlers.go`
*   **Frontend Service:** `src/lib/services/authService.ts`

| Method | Endpoint                      | Backend Handler        | Frontend Method        | Description                               |
| :----- | :---------------------------- | :--------------------- | :--------------------- | :---------------------------------------- |
| `POST` | `/api/v2/auth/login`          | `authHandler.Login`    | `authService.login`    | Authenticates a user and creates a session. |
| `POST` | `/api/v2/auth/logout`         | `authHandler.Logout`   | `authService.logout`   | Logs out the user and destroys the session. |
| `GET`  | `/api/v2/me`                  | `authHandler.Me`       | `authService.initialize` | Retrieves the current user's information. |
| `POST` | `/api/v2/auth/change-password` | `authHandler.ChangePassword` | `authService.updatePassword` | Changes the current user's password.      |

### 1.2. Campaign Endpoints

*   **Backend Handler:** `backend/internal/api/campaign_orchestrator_handlers.go`
*   **Frontend Service:** `src/lib/services/campaignService.production.ts`

| Method   | Endpoint                                                 | Backend Handler                          | Frontend Method                     | Description                                      |
| :------- | :------------------------------------------------------- | :--------------------------------------- | :---------------------------------- | :----------------------------------------------- |
| `POST`   | `/api/v2/campaigns/generate`                             | `h.createDomainGenerationCampaign`       | `campaignService.createCampaign`    | Creates a new domain generation campaign.        |
| `POST`   | `/api/v2/campaigns/dns-validate`                         | `h.createDNSValidationCampaign`          | `campaignService.createCampaign`    | Creates a new DNS validation campaign.           |
| `POST`   | `/api/v2/campaigns/http-validate`                        | `h.createHTTPKeywordCampaign`            | `campaignService.createCampaign`    | Creates a new HTTP keyword validation campaign.  |
| `GET`    | `/api/v2/campaigns`                                      | `h.listCampaigns`                        | `campaignService.getCampaigns`      | Lists all campaigns with optional filters.       |
| `GET`    | `/api/v2/campaigns/:campaignId`                          | `h.getCampaignDetails`                   | `campaignService.getCampaignById`   | Retrieves the details of a specific campaign.    |
| `GET`    | `/api/v2/campaigns/:campaignId/status`                   | `h.getCampaignStatus`                    | (Not explicitly used)               | Gets the status and progress of a campaign.      |
| `POST`   | `/api/v2/campaigns/:campaignId/start`                    | `h.startCampaign`                        | `campaignService.startCampaign`     | Starts a campaign.                               |
| `POST`   | `/api/v2/campaigns/:campaignId/pause`                    | `h.pauseCampaign`                        | `campaignService.pauseCampaign`     | Pauses a campaign.                               |
| `POST`   | `/api/v2/campaigns/:campaignId/resume`                   | `h.resumeCampaign`                       | `campaignService.resumeCampaign`    | Resumes a paused campaign.                       |
| `POST`   | `/api/v2/campaigns/:campaignId/cancel`                   | `h.cancelCampaign`                       | `campaignService.cancelCampaign`    | Cancels a campaign.                              |
| `PUT`    | `/api/v2/campaigns/:campaignId`                          | `h.updateCampaign`                       | (Not explicitly used)               | Updates a campaign's configuration.              |
| `DELETE` | `/api/v2/campaigns/:campaignId`                          | `h.deleteCampaign`                       | `campaignService.deleteCampaign`    | Deletes a campaign.                              |
| `GET`    | `/api/v2/campaigns/:campaignId/results/generated-domains` | `h.getGeneratedDomains`                  | `campaignService.getGeneratedDomains` | Retrieves the generated domains for a campaign.  |
| `GET`    | `/api/v2/campaigns/:campaignId/results/dns-validation`   | `h.getDNSValidationResults`              | `campaignService.getDNSValidationResults` | Retrieves the DNS validation results for a campaign. |
| `GET`    | `/api/v2/campaigns/:campaignId/results/http-keyword`     | `h.getHTTPKeywordResults`                | `campaignService.getHTTPKeywordResults` | Retrieves the HTTP keyword results for a campaign. |

## 2. WebSocket Communication Analysis

The application uses WebSockets for real-time communication, primarily for campaign progress updates.

*   **Backend Endpoint:** `GET /api/v2/ws`
*   **Backend Handler:** `backend/internal/api/websocket_handler.go`
*   **Backend Logic:** `backend/internal/websocket/`
*   **Frontend Service:** `src/lib/services/websocketService.simple.ts`

### 2.1. Connection Lifecycle

1.  The frontend establishes a WebSocket connection to the `/api/v2/ws` endpoint.
2.  The backend's `websocket_handler` authenticates the connection using the session cookie.
3.  A new `Client` is created on the backend to manage the connection.

### 2.2. Message Flow

*   **Client-to-Server:**
    *   `subscribe_campaign`: The frontend sends this message to subscribe to updates for a specific campaign.
    *   `unsubscribe_campaign`: The frontend sends this message to stop receiving updates for a campaign.
*   **Server-to-Client:**
    *   The backend broadcasts messages to subscribed clients. The primary message types are related to campaign progress, such as `campaign_progress`, `domain_generated`, and `campaign_complete`.

### 2.3. Message Formats

*   **Client-to-Server:**
    ```json
    {
      "type": "subscribe_campaign",
      "campaignId": "..."
    }
    ```
*   **Server-to-Client (`WebSocketMessage`):**
    ```json
    {
      "id": "...",
      "timestamp": "...",
      "type": "...",
      "sequenceNumber": 123,
      "campaignId": "...",
      "data": { ... }
    }