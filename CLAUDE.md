# Kuonix

Professional desktop RAW image processor with batch correction, grouping, and AI-assisted color correction.

## Architecture

3-module monorepo:
- `restful/` — Java 25 Spring Boot 3.5.7 backend (port **8081**)
  - `api/` — 6 REST controllers (Admin, Agent, ColorCorrection, ImageAnalysis, RawImage, Settings)
  - `services/` — 11 service classes (RawProcessing, ColorCorrection, ImageClassifier, ImageAnalysis, Grouping, Storage, etc.)
  - `dto/` — 15 request/response DTOs
  - `config/` — 6 Spring configs (Agent, Async, CORS, Multipart, DynamicOllama, ClassifierThresholds)
  - `agent/` — LangChain4j AI integration (KuonixAiService, KuonixAgentTools)
- `frontend/` — Electron 29.4.6 desktop shell, vanilla JS/HTML/CSS, spawns backend JAR as child process
- `htdocs/` — Static marketing website

## Tech Stack

- **Backend**: Java 25, Spring Boot 3.5.7, Gradle 9.0
- **AI**: LangChain4j 1.13.0 + Ollama Cloud (`langchain4j`, `langchain4j-ollama`)
- **Image**: OpenCV 4.10.0 (JavaCPP), LibRaw/dcraw (platform binaries in `frontend/bin/`)
- **Frontend**: Electron 29.4.6, vanilla JS, HTML, CSS
- **Testing**: JUnit 5, Spring MockMvc, Mockito — 92 tests total

## Commands

```bash
# Backend (from restful/)
./gradlew test          # Run 92 unit tests
./gradlew build         # Build JAR
./gradlew bootRun       # Start backend on port 8081
./gradlew clean build -x test  # Build without tests

# Frontend (from frontend/)
npm start               # Launch Electron app
npm run dev             # Launch with console logging
```

## Conventions

- Java packages: `app.restful.*`
- Logging: SLF4J Logger instance per class
- Config: YAML (`application.yaml`), not `.properties`
- No linters or formatters enforced
- Tests: JUnit 5 + `@WebMvcTest` + MockMvc; test config disables LangChain4j (`langchain4j.enabled: false`)
- SSE streaming for AI chat and long-running operations

## Rules

- Backend port is **8081**, not 8080
- AI features are conditional — bean creation depends on `~/.kuonix/ollama-settings.json`
- Use `StreamingChatModel` interface for bean return types, not concrete `OllamaStreamingChatModel`
- `@AiService` is processed by LangChain4j, not Spring — `@ConditionalOnProperty` doesn't work on it; use `@ConditionalOnBean` on consumers instead
- Ollama Cloud auth: `customHeaders()` with `Authorization: Bearer <key>`, not `.apiKey()` method
- Don't add comments, docstrings, or type annotations to unchanged code
- Don't refactor unrelated code
- Run `./gradlew test` after backend changes
- Settings persisted to `~/.kuonix/` directory
- `@JsonIgnoreProperties(ignoreUnknown = true)` on settings DTOs for schema evolution

## Skills

Custom skills are in `.claude/skills/`. Claude Code will auto-discover them.

| Skill | Trigger | Purpose |
| `kuonix-design-system` | Any CSS, color, spacing, token, theme, glass, component work | Full token system, glassmorphic patterns, dual theme rules |
| `gsap-animation` | animate, transition, motion, reveal, loading, streaming, GSAP | GSAP Core patterns for vanilla JS + Electron, motion tokens, lifecycle cleanup |
| `electron-ui` | ipc, backend, SSE, streaming, file dialog, window, port 8081 | Electron renderer/main boundary, backend API patterns, SSE consumers |
| `creative-frontend` | redesign, artistic, beautiful, inspiring, aesthetic, visual | Artistic elevation — grain, atmospheres, typography moments, photographic depth |
| `component-builder` | build, create, make, add, generate + any UI noun | Synthesizes all above into complete HTML/CSS/JS components |

### Usage Notes

- Always apply `kuonix-design-system` before writing any CSS
- `component-builder` is the primary entry point for "build me a X" requests
- `creative-frontend` extends (not replaces) Anthropic's public `frontend-design` skill
- All animation uses GSAP Core only (no Club plugins) — see `gsap-animation`
