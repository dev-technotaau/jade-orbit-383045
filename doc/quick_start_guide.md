# Quick Start Guide

Follow these steps to get Hire Adda running on your local machine.

## Prerequisites

- Node.js (v18 or higher)
- npm (v9 or higher)
- Docker Desktop (for Redis/Postgres local instances if needed)

## Installation

1.  **Clone the Repository**

    ```bash
    git clone <repo-url>
    cd hire-adda
    ```

2.  **Install Dependencies** (Root)
    ```bash
    npm install
    ```
    This command installs dependencies for both `backend` and `frontend` workspaces.

## Environment Setup

1.  **Backend Config**
    - Navigate to `backend/`.
    - Copy `.env.example` to `.env`.
    - Populate `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_NODE`, etc.
    - Run Prisma Migrations:
      ```bash
      npx prisma migrate dev
      ```

2.  **Frontend Config**
    - Navigate to `frontend/`.
    - Copy `.env.example` to `.env`.
    - Ensure `NEXT_PUBLIC_API_URL` points to `http://localhost:3001/api/v1`.

## Running the App

### Option A: Unified Dev (Recommended)

From the root directory, run:

```bash
npm run dev
```

This starts both frontend (port 3000) and backend (port 3001) concurrently.

### Option B: Docker (Production Sim)

To spin up the entire stack including databases and services:

```bash
docker-compose up --build
```

## Accessing the App

- **Web Interface**: [http://localhost:3000](http://localhost:3000)
- **API Documentation**: [http://localhost:3001/api-docs](http://localhost:3001/api-docs) (if Swagger enabled)
- **Mailpit (Email Testing)**: [http://localhost:8025](http://localhost:8025) (if running via Docker)
