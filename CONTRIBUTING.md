# Contributing to Digital Earth Indonesia WebGIS

Thank you for your interest in contributing to **Digital Earth Indonesia WebGIS**!

## Development Setup

1. **Prerequisites**:
   - [Bun](https://bun.sh/) (v1.1 or higher) or Node.js 18+

2. **Clone and Install**:
   ```bash
   git clone https://github.com/chipslova/webgis.git
   cd webgis
   bun install
   ```

3. **Start Development Server**:
   ```bash
   bun run dev
   ```

4. **Testing & Code Quality**:
   - Run tests: `bun run test`
   - Typecheck: `bun x tsc --noEmit`
   - Build bundle: `bun run build`

## Code Guidelines

- **TypeScript**: Strict typing with zero `any` where avoidable.
- **XSS Sanitization**: All user-provided strings and dynamic HTML attributes must pass through `escapeHtml()` or `sanitizeAttribute()`.
- **Bundle Efficiency**: Heavy spatial analysis modules should be lazily loaded via dynamic `import()` to keep initial page loads fast.
- **Accessibility**: Maintain semantic HTML, ARIA attributes, keyboard navigability, and high-contrast color standards.

## Submitting Pull Requests

1. Fork the repository and create a feature branch (`git checkout -b feature/amazing-feature`).
2. Ensure all tests pass (`bun run test`) and typecheck passes (`bun x tsc --noEmit`).
3. Commit your changes with clear, descriptive commit messages.
4. Push to your branch and open a Pull Request against `main`.
