# Whatsapp Message Blaster - Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![BullMQ](https://img.shields.io/badge/BullMQ-D82A2E?style=for-the-badge&logo=bull&logoColor=white)](https://bullmq.io/)

A robust, scalable backend system designed to automate high-volume, targeted messaging campaigns via WhatsApp. This platform replaces manual processes with a reliable, containerized solution that provides real-time visibility into campaign execution and web-based session management.

---

## ✨ Features

-   **Automated Message Blasts:** Initiate large campaigns to pre-defined or uploaded recipient lists with a single API call.
-   **Dynamic Session Management:**
    -   Manage multiple WhatsApp accounts through a database and REST API.
    -   Add, remove, or update sessions without requiring a code change or deployment.
-   **Web-Based QR Authentication:** A secure UI flow for connecting WhatsApp accounts. The backend relays QR codes directly to authorized frontend clients via WebSockets.
-   **Real-Time Progress Tracking:** Monitor campaign status (sent, failed, total) live via a secure, ticket-based WebSocket connection.
-   **Scalable & Resilient Architecture:** Built with a separate job queue (`BullMQ`) and worker processes, allowing for horizontal scaling and reliable, retryable message sending.
-   **Heavy Job Offloading:** File parsing and recipient processing are handled by background workers, ensuring the API remains fast and responsive at all times.
-   **Excel Recipient Import:** Kick off blasts instantly by uploading an Excel (`.xlsx`) file containing a custom recipient list.
-   **Built-in Observability:**
    -   **Swagger UI:** Interactive API documentation for easy exploration and testing.
    -   **Bull Board:** A pre-configured dashboard for monitoring the status of all message and processing jobs.

## 🏛️ System Architecture

The application is built as a single Node.js/TypeScript project but runs as two distinct processes, orchestrated by Docker Compose. This separation of concerns is key to its scalability and reliability.

-   **`API` Service:** An Express.js server responsible for:
    -   Handling all incoming HTTP REST API requests.
    -   Managing WebSocket connections for real-time client updates.
    -   Validating requests and enqueuing jobs into the Redis-backed message queue.
    -   Serving the Swagger UI and Bull Board dashboard.

-   **`Worker` Service:** A background process responsible for:
    -   Consuming jobs from the `file-process` and `message` queues.
    -   Managing multiple Baileys (WhatsApp) client instances based on database configuration.
    -   Handling the entire WhatsApp connection lifecycle (generating QR codes, managing disconnections).
    -   Publishing status updates (progress, QR codes) to Redis for the API service to relay.

-   **`Redis` Service:** Acts as the central nervous system, providing:
    -   A persistent job queue (via **BullMQ**).
    -   A Pub/Sub mechanism for inter-process communication between the `API` and `Worker`.
    -   A cache for campaign recipient lists.

-   **`SQLite` Database:** A file-based database (persisted via a Docker volume) used to dynamically store and manage session configurations (`sessions.sqlite`).

## ⚙️ Tech Stack

-   **Backend:** Node.js, Express.js, TypeScript
-   **WhatsApp Integration:** `@whiskeysockets/baileys`
-   **Job Queue:** BullMQ
-   **Cache & Pub/Sub:** Redis
-   **Session Configuration:** SQLite (`better-sqlite3`)
-   **Real-time Communication:** WebSockets (`ws`)
-   **File Uploads:** Multer
-   **Excel Parsing:** XLSX (`sheetjs`)
-   **Containerization:** Docker, Docker Compose
-   **API Documentation:** Swagger (OpenAPI)

## 🚀 Getting Started

### Prerequisites

-   [Docker](https://www.docker.com/get-started/) and [Docker Compose](https://docs.docker.com/compose/install/)
-   [Node.js](https://nodejs.org/) and npm (for local development and dependency installation)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/it-rspi/whatsapp-blaster-backend.git
    cd whatsapp-blaster-backend
    ```

2.  **Install local dependencies:**
    *(This is primarily for IDE type-hinting and running local scripts.)*
    ```bash
    npm install
    ```

3.  **Configure your environment:**
    Copy the example environment file. You no longer need to define `SESSION_IDS` here, as sessions are managed via the API.
    ```bash
    cp .env.example .env
    ```
    Open `.env` to configure database credentials and Redis connection details if they differ from the Docker defaults.

### Running the Application

This project is configured with separate Docker Compose files for development and production.

#### For Development (with Hot-Reloading)

This mode mounts your local `src` directory into the containers. Any code changes will be reflected instantly without rebuilding the image.

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

#### For Production

This mode builds a lean, optimized production image using a multi-stage `Dockerfile`.

```bash
docker-compose up --build -d
```

Once the services are running, you can access:
-   **API Server:** `http://localhost:3000`
-   **API Docs (Swagger):** `http://localhost:3000/api/docs`
-   **Queue Dashboard (Bull Board):** `http://localhost:3000/admin/queues`

## 📖 API Usage & Flow

### 1. Session Management

First, create a session configuration. This tells the worker to start managing a new WhatsApp instance.

`POST /api/sessions/config`
Request Body:
```json
{
  "id": "marketing-promo",
  "friendlyName": "Q4 Marketing Promo",
  "businessUnit": "Marketing"
}
```

### 2. QR Code Authentication Flow

To authenticate the `marketing-promo` session:

1.  **Subscribe:** A frontend client connects to the general WebSocket endpoint to listen for status updates: `ws://localhost:3000`.
2.  **Command:** The frontend sends a `POST` request to trigger the connection: `POST /api/sessions/marketing-promo/connect`.
3.  **React:** The Worker process starts the authentication, generates a QR code, and publishes it to Redis. The API service relays this `qr:update` event over the WebSocket to the frontend, which then displays the QR code for scanning.

### 3. Campaign Initiation

1.  **Initiate Blast:**
    `POST /api/blasts`
    The request must be `multipart/form-data`. Here is a `cURL` example:

    ```bash
    curl -X POST http://localhost:3000/api/blasts \
      -F "sessionId=marketing-promo" \
      -F "message=Hello {name}, don't miss our amazing promo!" \
      -F "recipientsFile=@path/to/recipients.xlsx" \
      -F "media=@path/to/image.png"
    ```
    The API responds immediately with a `blastId`.

2.  **Monitor Progress:**
    -   The frontend first makes an authenticated request to `GET /api/ws-ticket?blastId=<your-blast-id>` to receive a short-lived, single-use ticket.
    -   It then connects to the WebSocket with this ticket: `ws://localhost:3000?ticket=<your-ticket>`.
    -   The client will now receive `blast:started` and `blast:progress` events in real-time for this specific blast.

## 🧪 Testing

This project uses [Jest](https://jestjs.io/) and [Supertest](https://github.com/visionmedia/supertest) for testing API endpoints. External services like Redis are mocked, allowing tests to run in isolation.

To run the entire test suite:

```bash
npm test
```

## 📁 Folder Structure

```
.
├── data/           # Persisted SQLite database files
├── sessions/       # Persisted Baileys authentication files
├── uploads/        # Temporary storage for uploaded recipient files
├── src
│   ├── api/        # Express server, controllers, routes, WebSocket manager
│   ├── worker/     # Background worker, Bailey's session manager, job processors
│   └── shared/     # Code used by both API & Worker (configs, types, Redis, etc.)
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 📜 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
