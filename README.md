# Kangana Silks E-Commerce Backend

Complete backend system for sarees and dhotis e-commerce platform with video consultation, built with clean DDD architecture.

## Features

21 Complete E-Commerce Modules with DDD Architecture

## Tech Stack

- Node.js 20+ with TypeScript
- Express.js Framework
- PostgreSQL 15+ with Prisma ORM
- Redis for Caching
- Socket.IO for Real-time
- Razorpay Payment Gateway
- Shiprocket Shipping
- Winston Logger
- Zod Validation

## Quick Start

Install dependencies:
npm install --legacy-peer-deps

Generate Prisma client:
npx prisma generate

Run migrations:
npx prisma migrate dev

Start server:
npm run dev

## Docker

docker-compose up -d

## Documentation

- IMPLEMENTATION_GUIDE.md - Implementation details
- COMPLETE-SETUP-GUIDE.md - Setup instructions
- PROJECT-STATUS.md - Current status
- MODULE_GENERATION_CONFIG.json - Module configuration

## Status

Foundation: COMPLETE
Infrastructure: COMPLETE
Module Implementation: PENDING

Ready for business logic implementation!


## Email delivery (Amazon SES)

Application email delivery uses Amazon SES in `ap-south-1` through the AWS SDK default credential provider chain (use an EC2 IAM role in production). Order/notification emails, password-reset emails, and newsletter emails share one SES transport. The existing PostgreSQL-backed email job worker and retry handling are retained.

See [docs/SES_SETUP.md](docs/SES_SETUP.md) and `.env.ses.example` for required environment variables and the least-privilege EC2 IAM policy. SNS is optional for sending; SES event feedback can be integrated separately.
