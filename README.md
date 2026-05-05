# Playwright Test Suite

Production-grade QA automation project for a B2B HRTech platform.

## Why This Repository

This project demonstrates a real-world test architecture for a large product with:
- UI and API coverage in one suite
- Role-based fixtures and isolated test data
- Database-level verification for critical scenarios
- Reporting for fast triage and auditability

## Quick Facts

- 764 JavaScript spec files in total
- 729 functional tests
- 18 security tests
- 14 load tests
- Stack: Playwright Test, JavaScript, Allure, optional TestRail sync, MySQL verifiers

## Stack

| Layer | Tools |
|---|---|
| Framework | Playwright Test (JavaScript) |
| API testing | Playwright request context |
| UI abstraction | Page Object Model |
| Assertions | Playwright expect |
| Reporting | HTML report, Allure, optional TestRail |
| Data checks | MySQL verifiers |
| Tooling | ESLint, Prettier |

## Repository Structure

```text
playwright-tests/
├── tests/
│   ├── functional/
│   ├── security/
│   ├── load/
│   ├── fixtures/
│   └── utils/
├── pages/
├── scripts/
├── docs/
├── global-setup.js
├── playwright.config.js
├── package.json
└── .env.example
```

## Test Architecture Highlights

- Role fixtures: admin, manager, user, head, support
- Fast auth in global setup with automatic fallback strategy
- Seed helpers for deterministic data preparation
- DB verification layer for API/UI side effects
- Tag-driven execution strategy for smoke/regression/negative/security

## Local Setup

```bash
npm install
cp .env.example .env
# fill credentials and base URLs
```

## Common Commands

```bash
# all tests
npm test

# suites
npm run test:functional
npm run test:security
npm run load:test

# smoke
npm run test:smoke

# reports
npm run report
npm run allure:gen
npm run allure:open
```

For Windows shell commands that invoke Playwright directly, use npx.cmd.

## Public Sanitization Notice

This public repository was sanitized for portfolio and hiring review:
- internal emails and personal identifiers were replaced
- environment-specific hosts and sensitive defaults were anonymized
- runtime artifacts and local-only files were removed

The implementation patterns, project structure, and engineering approach remain intact.

## Documentation

- Business logic reference: docs/BUSINESS_LOGIC_REFERENCE.md
- System overview: docs/01_OVERVIEW.md
- Performance Review: docs/02_PERFORMANCE_REVIEW.md
- Surveys: docs/03_SURVEYS.md
- Objectives: docs/05_OBJECTIVES.md
- Org Structure: docs/06_ORG_STRUCTURE.md
- Test review checklist: docs/TEST_REVIEW_CHECKLIST.md

## Author

Yuri Ustinov  
QA Automation Engineer  
Telegram: https://t.me/yuriustinov  
GitHub: https://github.com/therealbobbybrown
