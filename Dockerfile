# Multi-stage lightweight Python Dockerfile for MedKnow Healthcare Portal
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Expose port (default 5000)
ENV PORT=5000
EXPOSE 5000

# Run with Gunicorn WSGI server
CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "4", "--timeout", "120"]
