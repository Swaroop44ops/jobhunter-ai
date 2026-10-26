# Use official Microsoft Playwright image with all OS dependencies and Chromium pre-installed
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install Node dependencies
RUN npm install --production=false

# Ensure Chromium browser binary is installed
RUN npx playwright install chromium

# Copy application code
COPY . .

# Create necessary runtime directories
RUN mkdir -p data/resumes data/screenshots data/browser_profile config

# Set environment variables for Render production
ENV PORT=3000
ENV HEADLESS=true
ENV NODE_ENV=production
ENV RENDER=true

# Expose server port
EXPOSE 3000

# Start command
CMD ["node", "src/server.js"]
