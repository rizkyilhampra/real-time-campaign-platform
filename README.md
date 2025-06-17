# Real-Time Campaign Messaging Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A robust, scalable backend system designed to automate high-volume, targeted messaging campaigns via WhatsApp. This platform replaces manual processes with a reliable, containerized solution that provides real-time visibility into campaign execution and web-based session management.

---

## ✨ Features

-   **Automated Message Blasts:** Initiate large campaigns to pre-defined user segments with a single API call.
-   **Real-Time Progress Tracking:** Monitor campaign status (sent, failed, total) live via a WebSocket connection.
-   **Web-Based QR Authentication:** Manage WhatsApp account connections through a secure UI flow. No terminal access required for non-technical users. The backend relays QR codes directly to the frontend via WebSockets.
-   **Scalable & Resilient Architecture:** Built with a separate job queue and worker processes, allowing for horizontal scaling and reliable, retryable message sending.
-   **Multi-Session Support:** Manage multiple distinct WhatsApp accounts (e.g., for marketing, alerts) simultaneously.
-   **Interactive API Documentation:** Includes a built-in Swagger UI for easy API exploration and testing.
-   **Job Queue Monitoring:** A pre-configured Bull Board dashboard provides visibility into the message queue.
-   **Excel Recipient Import:** Quickly kick off blasts by uploading an Excel (.xlsx) file containing your own recipient list.

## 🏛️ System Architecture

The application is built as a single Node.js/TypeScript project but runs as two distinct processes, orchestrated by Docker Compose. This separation of concerns is key to its scalability and reliability.

-   **`API` Service:** An Express.js server responsible for:
    -   Handling all incoming HTTP REST API requests.
    -   Managing WebSocket connections for real-time client updates.
    -   Enqueuing jobs into the Redis-backed message queue.
    -   Relaying QR code and status events from the Worker to the frontend.
    -   Serving the Swagger UI and Bull Board dashboard.

-   **`Worker` Service:** A background process responsible for:
    -   Consuming jobs from the message queue.
    -   Managing multiple Baileys (WhatsApp) client instances.
    -   Sending the actual WhatsApp messages.
    -   Handling the entire WhatsApp connection lifecycle (generating QR codes, managing disconnections).
    -   Publishing status updates (progress, QR codes) to Redis for the API service to relay.

-   **`Redis` Service:** Acts as the central nervous system, providing:
    -   A persistent job queue (via **BullMQ**).
    -   A Pub/Sub mechanism for inter-process communication between the `API` and `Worker`.

## ⚙️ Tech Stack

-   **Backend:** Node.js, Express.js, TypeScript
-   **WhatsApp Integration:** `@whiskeysockets/baileys`
-   **Job Queue:** BullMQ
-   **Database/Cache:** Redis
-   **Real-time Communication:** WebSockets (`ws`)
-   **File Uploads:** Multer
-   **Excel Parsing:** XLSX (`sheetjs`)
-   **Containerization:** Docker, Docker Compose
-   **API Documentation:** Swagger (OpenAPI)
-   **Code Formatting:** Prettier

## 🚀 Getting Started

### Prerequisites

-   [Docker](https://www.docker.com/get-started/) and [Docker Compose](https://docs.docker.com/compose/install/)
-   [Node.js](https://nodejs.org/) and npm (for dependency installation)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repo-url>
    cd <your-repo-name>
    ```

2.  **Install local dependencies:**
    *(This is primarily for IDE type-hinting and running local scripts like formatting.)*
    ```bash
    npm install
    ```

3.  **Configure your environment:**
    Copy the example environment file and customize it.
    ```bash
    cp .env.example .env
    ```
    Open the `.env` file and edit the `SESSION_IDS` variable. This comma-separated list defines the unique identifiers for the WhatsApp accounts you want to manage.
    ```env
    # e.g., for a marketing and a support account
    SESSION_IDS=marketing-promo,support-alerts
    ```

### Running the Application

This project is configured with separate Docker Compose files for development and production.

#### For Development (with Hot-Reloading)

This mode uses `nodemon` and mounts your local `src` directory into the containers. Any code changes you make will be reflected instantly without needing to rebuild the image.

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

#### For Production

This mode builds a lean, optimized production image using a multi-stage `Dockerfile`.

```bash
docker-compose up --build -d
```

Once the services are running, you can access the following:
-   **API Server:** `http://localhost:3000`
-   **API Docs (Swagger):** `http://localhost:3000/api/docs`
-   **Queue Dashboard (Bull Board):** `http://localhost:3000/admin/queues`

## 📖 API Usage & Flow

### Session Management (QR Code Flow)

To authenticate a new WhatsApp session (e.g., `marketing-promo`):

1.  **Subscribe:** A frontend client connects to the WebSocket endpoint, providing the `sessionId` as a query parameter.
    `ws://localhost:3000?sessionId=marketing-promo`

2.  **Command:** The frontend sends a `POST` request to the API to trigger the connection process.
    `POST /api/sessions/marketing-promo/connect`

3.  **React:** The backend Worker process starts the authentication, generates a QR code, and publishes it. The API service relays this event over the WebSocket. The frontend listens for a `qr_update` event and renders the received QR code image.

### Campaign Initiation

1.  **Preview (Optional):**
    `GET /api/campaigns/recipients?campaignId=october-promo`

2.  **Initiate Blast:**
    `POST /api/blasts`
    Request Body:
    ```json
    {
      "campaignId": "october-promo",
      "sessionId": "marketing-promo",
      "message": "Hello {name}, don't miss our amazing promo!"
    }
    ```
    The API responds immediately with a `blastId`.

    Alternatively, you can omit `campaignId` and upload an Excel file instead. The request must be sent as `multipart/form-data`:

    ```bash
    curl -X POST http://localhost:3000/api/blasts \
      -F "sessionId=marketing-promo" \
      -F "message=Hello {name}, don't miss our amazing promo!" \
      -F "recipientsFile=@recipients.xlsx"
    ```

    The Excel sheet should contain at minimum a `phone` column and optionally a `name` column. If both `campaignId` and an Excel file are supplied, the recipients are merged and deduplicated by phone number.

3.  **Monitor Progress:**
    Connect to the WebSocket with the `blastId`:
    `ws://localhost:3000?blastId=<your-blast-id>`
    You will receive `blast_progress` events in real-time.

## 🛠️ Project Scripts

-   `npm run format`: Automatically formats all `.ts` files in the `src` directory using Prettier.
-   `npm run format:check`: Checks if all files are correctly formatted. Ideal for CI/CD pipelines.
-   `npm run dev`: Runs both the `api` and `worker` services in development mode with `nodemon` (for local, non-Docker development).

## 📁 Folder Structure

```
.
├── src
│   ├── api         # Express server, controllers, routes, WebSocket manager
│   ├── worker      # Background worker, Baileys session manager, job processor
│   └── shared      # Code used by both API and Worker (configs, types, Redis, etc.)
├── .env.example    # Environment variable template
├── .prettierrc.json# Prettier formatting rules
├── docker-compose.yml  # Production Docker configuration
├── docker-compose.dev.yml # Development Docker overrides
├── Dockerfile      # Multi-stage Dockerfile for optimized builds
└── package.json
```

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
