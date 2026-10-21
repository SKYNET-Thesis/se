# OmniArm Software Platform

## Components

- Mobile Application
- Backend Service
- AI Integration Service
- Raspberry Pi Edge Agent
- Shared API Contracts
- Infrastructure and Deployment

## System Flow

Mobile App → Backend → AI Integration → Raspberry Pi → SO-101

## Local Development

docker compose up --build

## Repository Structure

- apps/mobile
- services/backend
- services/ai-integration
- edge/raspberry-pi-agent
- packages/contracts
- tests/end-to-end
- docs
- infra

## RobotEdu web platform

- Web client source: `web/robot-edu` (`npm ci && npm run dev`).
- NestJS education API: `services/education-api`; Compose publishes `http://localhost:3001/api/v1`.
- Private runtime: `services/robot-runtime`; it is fail-closed and has no host port.
