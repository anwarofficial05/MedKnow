# MedKnow — Healthcare Knowledge Management Portal

A full-stack, production-grade Healthcare Knowledge Management (KM) platform designed for hospital networks and clinical teams. It operationalizes the complete clinical KM lifecycle: **Capture → Store → Organize → Validate → Share → Reuse → Govern → Retire** clinical knowledge assets with integrated medical decision support tools.

---

## 🌟 Advanced Features

### 1. 🚀 Instant Demo Evaluation & Role Switcher
- **1-Click Demo Login** on the login screen for instantaneous testing without typing passwords.
- **In-App Fast Account Switcher** directly in the sidebar to seamlessly toggle between Admin, Emergency Physician, Internist, ICU Nurse, and Clinical Pharmacist.

### 2. 🧮 Interactive Medical Calculators & Decision Support
- **qSOFA Sepsis Risk Calculator**: Rapid assessment of altered mentation, tachypnea, and hypotension with immediate 1-Hour Sepsis Bundle guidance.
- **Cockcroft-Gault Creatinine Clearance (CrCl / GFR)**: Estimates renal function for accurate high-alert drug dosing.
- **BMI & Ideal Body Weight (Devine Equation)**: Computes nutritional indices and weight-based drug clearance metrics.
- **IV Infusion & Drip Rate Calculator**: Computes pump rates (mL/hr) and gravity drip rates (gtt/min) across macro/micro sets.
- **APGAR Newborn Score Calculator**: Standardized neonatal assessment at 1 and 5 minutes with resuscitation alerts.

### 3. ⚖️ Clinical Knowledge Governance & Lifecycle Workflow
- **KM Workflow**: `Draft` → `Submitted for Peer Review` → `Approved / Published` → `Archived / Retired`.
- **Peer Review Queue**: Allows senior clinicians and administrators to review, request revisions, or approve submitted guidelines.
- **Version Audit Trail & Diff Comparison**: Full snapshotting on every revision with side-by-side line diff inspection and **1-Click Version Restore**.

### 4. 📚 Rich Clinical Knowledge Base & Decision Support
- **Evidence Hierarchy Badges**: Level I (Systematic Reviews), Level II (RCTs), Level III (Observational Studies), Level IV (Expert Consensus).
- **Target Audience & Urgency Triage**: Categorized by clinical role (Emergency, ICU, Ward, Outpatient) and urgency (Critical, Important, Routine).
- **Clinical Markdown Callouts**: Alert callouts for `> [!CRITICAL] Immediate Action`, `> [!WARNING] Caution`, and `> [!NOTE] Clinical Pearl`.
- **Interactive Ward Checklists**: Embedded checklists with live checkboxes for bedside procedures.
- **Printable Protocol Sheets**: 1-Click Ward Print format with hospital branding for paper charting and shift binders.
- **Ward Bookmarks & Pinned Guidelines**: Quick access star bookmarking for fast shift reference.

### 5. 👥 Communities of Practice & Clinical Collaboration
- **Knowledge Gap & Protocol Request Board**: Staff can request missing clinical guidelines, with community upvoting and specialist assignment.
- **Clinical Consults & Q&A Board**: Departmental case discussions with verified hospital consensus solutions.
- **Peer Ratings & Clinical Discussions**: 5-star peer validation and inter-professional ward notes.

### 6. 📢 Hospital Urgent Clinical Advisories
- Pinned, color-coded hospital broadcast banner for infection control notices and urgent drug alerts.

### 7. ⚙️ Hospital Administration Hub
- Staff role management (Promote to Admin / Contributor / Viewer).
- Account status toggling (Active / Deactivated).
- Database backup JSON export.
- Clinical audit event logs.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3, Flask, Flask-SQLAlchemy, PyJWT, Werkzeug, Gunicorn |
| **Database** | SQLite (zero-config local) & PostgreSQL (production cloud auto-detection) |
| **Frontend** | Vanilla HTML5 / CSS3 / JavaScript SPA (no Node/npm build steps required) |
| **Infrastructure** | Render Blueprint (`render.yaml`), Docker (`Dockerfile`, `docker-compose.yml`), Procfile |

---

## 🚀 Setup & Run Locally

```bash
# 1. Navigate to directory
cd healthcare_kmp

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start application
python app.py
```

Open **http://localhost:5000** in your browser. The database and rich clinical seed data are generated automatically on first run.

---

## 🌐 Free Cloud Hosting (Render.com in 2 Minutes)

See [DEPLOYMENT.md](DEPLOYMENT.md) for full hosting instructions.

1. Push this folder to a GitHub repository.
2. Sign up at [render.com](https://render.com).
3. Click **New +** → **Blueprint** → connect your repo.
4. Click **Apply**. Render will automatically build and host the live web service for free with HTTPS!

---

## 👥 Demo Accounts

| Role | Hospital Email | Password | Clinical Specialization |
|---|---|---|---|
| **Admin** | `admin@hospital.local` | `admin123` | Dr. Arthur Director (Chief Medical Officer) |
| **Contributor** | `dr.rao@hospital.local` | `doctor123` | Dr. Ananya Rao (Senior Consultant, Internal Medicine) |
| **Contributor** | `dr.menon@hospital.local` | `doctor123` | Dr. Karthik Menon (Emergency & Trauma Specialist) |
| **Viewer** | `nurse.iyer@hospital.local` | `viewer123` | Nurse Priya Iyer (Lead Nursing Officer, ICU) |
| **Contributor** | `pharm.chen@hospital.local` | `doctor123` | Dr. David Chen (Senior Clinical Pharmacologist) |
