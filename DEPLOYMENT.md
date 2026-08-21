# Free Hosting & Deployment Guide: MedKnow Healthcare KM Portal

This guide provides **step-by-step instructions to host MedKnow 100% for free** for your own hospital or clinical organization.

---

## ⚡ Quick Option 1: Render.com (Recommended — 100% Free & Fastest)

Render offers a **free web service tier** with automated Git deployments, free HTTPS/SSL certificate, and zero maintenance.

### Step-by-Step Instructions:

1. **Push your code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Deploy MedKnow Healthcare Knowledge Management Portal"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/medknow-portal.git
   git push -u origin main
   ```

2. **Sign up on Render**:
   - Go to [render.com](https://render.com) and sign up with your GitHub account.

3. **Deploy Web Service**:
   - In the Render Dashboard, click **New +** → **Blueprint**.
   - Select your GitHub repository.
   - Render detects `render.yaml` and configures the build command, Gunicorn WSGI server, and environment variables automatically.
   - Click **Apply**.

4. **Your Live Portal**:
   - In 1-2 minutes, Render will provide a live URL like `https://medknow-healthcare-portal.onrender.com`.

5. **Initial Setup (Creating Your Administrator Account)**:
   - Visit your live URL.
   - Because no accounts exist yet, the portal will prompt you with the **Initial Portal Setup** screen.
   - Fill in your **Name**, **Email**, **Department**, and **Password**.
   - Your account is automatically granted **Super Administrator** privileges!
   - You can then author protocols, create hospital categories, and invite your clinical colleagues to register.

---

## 🚀 Option 2: Koyeb (100% Free Serverless Container)

1. Sign up at [koyeb.com](https://www.koyeb.com).
2. Click **Create App** → **GitHub** → select your repository.
3. **Build Command**: `pip install -r requirements.txt`
4. **Run Command**: `gunicorn wsgi:app --bind 0.0.0.0:8000 --workers 2`
5. Click **Deploy**.

---

## 🐍 Option 3: PythonAnywhere (Free Tier)

1. Sign up at [pythonanywhere.com](https://www.pythonanywhere.com).
2. Open a **Bash Console** and clone your repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/medknow-portal.git
   cd medknow-portal/healthcare_kmp
   pip install -r requirements.txt
   ```
3. Go to **Web** tab → **Add a new web app** → choose **Manual configuration (Flask)** → **Python 3.12**.
4. In the WSGI configuration file, replace its content with:
   ```python
   import sys
   path = '/home/YOUR_USERNAME/medknow-portal/healthcare_kmp'
   if path not in sys.path:
       sys.path.append(path)
   from app import app as application
   ```
5. Click **Reload Web App** and visit your free `username.pythonanywhere.com` domain!

---

## 🐳 Option 4: Docker / Self-Hosted VPS

To run with Docker:

```bash
docker compose up -d --build
```
Access the portal at `http://localhost:5000` or `http://YOUR_SERVER_IP:5000`.

---

## 👥 How User Profiles & Roles Work

- **First Registered User**: Automatically becomes **Super Administrator** (Chief Medical Officer / Admin).
- **Subsequent Registrations**: Can register as **Contributor** (Physicians / Specialists who author articles) or **Viewer** (Nurses / Residents / Staff).
- **Admin Hub**: As the Administrator, you can promote any user to Admin, create new clinical categories, publish urgent hospital broadcasts, and export full database backups.
