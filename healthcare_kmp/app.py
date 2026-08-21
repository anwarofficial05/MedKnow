"""
MedKnow — Healthcare Knowledge Management Portal
=================================================
Production-grade Healthcare Knowledge Management (KM) platform for hospital
networks and clinical teams.
"""
import os
import io
import json
import functools
from datetime import datetime, timedelta

import jwt
from flask import Flask, request, jsonify, send_from_directory, Response
from werkzeug.middleware.proxy_fix import ProxyFix
from sqlalchemy import or_, desc, func

from models import (
    db, User, Category, Article, ArticleVersion, Comment, Rating,
    Bookmark, KnowledgeRequest, RequestUpvote, ClinicalAdvisory,
    ClinicalQuestion, ClinicalAnswer, AuditLog,
    ROLE_ADMIN, ROLE_CONTRIBUTOR, ROLE_VIEWER,
    STATUS_DRAFT, STATUS_IN_REVIEW, STATUS_PUBLISHED, STATUS_ARCHIVED,
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder="static", template_folder="templates")

# Reverse proxy support for cloud deployments (Render, Fly.io, Nginx)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

# Database Configuration (supports PostgreSQL for Cloud and SQLite for local/zero-config)
database_url = os.environ.get("DATABASE_URL")
if database_url:
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
else:
    app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(BASE_DIR, "healthcare_kmp.db")

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "medknow-production-secret-key-kmp-2026")
app.config["JWT_EXP_HOURS"] = int(os.environ.get("JWT_EXP_HOURS", 24))

db.init_app(app)


# ---------------------------------------------------------------------------
# Auth Helpers & Middleware
# ---------------------------------------------------------------------------
def generate_token(user):
    payload = {
        "user_id": user.id,
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(hours=app.config["JWT_EXP_HOURS"]),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")


def decode_token(token):
    try:
        return jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def get_current_user():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    payload = decode_token(token)
    if not payload:
        return None
    user = User.query.get(payload.get("user_id"))
    if user and not user.is_active:
        return None
    return user


def login_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        request.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def roles_required(*roles):
    def decorator(fn):
        @functools.wraps(fn)
        @login_required
        def wrapper(*args, **kwargs):
            if request.current_user.role not in roles:
                return jsonify({"error": "You do not have sufficient permissions to perform this action"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def log_audit(action, details=""):
    try:
        user_id = getattr(request, "current_user", None)
        user_id = user_id.id if user_id else None
        ip = request.headers.get("X-Forwarded-For", request.remote_addr or "")
        audit = AuditLog(user_id=user_id, action=action, details=details[:480], ip_address=ip[:50])
        db.session.add(audit)
        db.session.commit()
    except Exception:
        db.session.rollback()


# ---------------------------------------------------------------------------
# Frontend Root & System Status
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(app.template_folder, "index.html")


@app.route("/api/system/status", methods=["GET"])
def system_status():
    """Returns onboarding and setup status for initial deployment."""
    user_count = User.query.count()
    return jsonify({
        "is_setup": user_count > 0,
        "user_count": user_count,
        "portal_name": "MedKnow Healthcare Portal",
    })


@app.route("/api/health", methods=["GET"])
def health_check():
    """Service health check endpoint for monitoring & cloud hosting."""
    db_ok = True
    try:
        db.session.execute(db.text("SELECT 1"))
    except Exception:
        db_ok = False

    return jsonify({
        "status": "healthy" if db_ok else "degraded",
        "service": "MedKnow Healthcare Knowledge Management Portal",
        "timestamp": datetime.utcnow().isoformat(),
        "database": "connected" if db_ok else "error",
        "db_type": "PostgreSQL" if "postgresql" in app.config["SQLALCHEMY_DATABASE_URI"] else "SQLite",
        "version": "2.4.0",
    }), 200 if db_ok else 500


# ---------------------------------------------------------------------------
# Auth Routes (Self-Registration & First User Admin Setup)
# ---------------------------------------------------------------------------
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    department = (data.get("department") or "").strip()
    title = (data.get("title") or "").strip()
    role = data.get("role") or ROLE_VIEWER

    if not name or not email or len(password) < 6:
        return jsonify({"error": "Name, valid email and a password of 6+ characters are required"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with that email already exists"}), 409

    # FIRST USER RULE: If no users exist, make the very first user the System Administrator
    is_first_user = User.query.count() == 0
    if is_first_user:
        role = ROLE_ADMIN
        if not title:
            title = "Chief Medical Officer / Administrator"
    else:
        if role not in (ROLE_CONTRIBUTOR, ROLE_VIEWER):
            role = ROLE_VIEWER

    colors = ["#1F6F78", "#7FA98E", "#C97A2B", "#8060B8", "#3C6E9A", "#C1503F", "#132A31"]
    color = colors[len(name) % len(colors)]

    user = User(
        name=name,
        email=email,
        role=role,
        department=department or ("Clinical Administration" if is_first_user else "General Medicine"),
        title=title or ("Medical Director" if is_first_user else "Clinical Staff"),
        avatar_color=color,
        is_active=True,
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = generate_token(user)
    log_audit("REGISTER", f"User registered: {user.name} ({user.role})")
    return jsonify({
        "token": token,
        "user": user.to_dict(),
        "is_admin": user.role == ROLE_ADMIN,
        "is_first_user": is_first_user,
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401

    if not user.is_active:
        return jsonify({"error": "This account has been deactivated. Please contact the administrator."}), 403

    token = generate_token(user)
    log_audit("LOGIN", f"User {user.name} logged in")
    return jsonify({"token": token, "user": user.to_dict()})


@app.route("/api/auth/me", methods=["GET"])
@login_required
def me():
    return jsonify(request.current_user.to_dict())


@app.route("/api/auth/profile", methods=["PUT"])
@login_required
def update_profile():
    user = request.current_user
    data = request.get_json(force=True, silent=True) or {}

    if "name" in data and data["name"].strip():
        user.name = data["name"].strip()
    if "department" in data:
        user.department = (data["department"] or "").strip()
    if "title" in data:
        user.title = (data["title"] or "").strip()
    if "avatar_color" in data and data["avatar_color"]:
        user.avatar_color = data["avatar_color"]
    if "password" in data and data["password"]:
        if len(data["password"]) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        user.set_password(data["password"])

    db.session.commit()
    log_audit("UPDATE_PROFILE", f"User {user.name} updated profile")
    return jsonify(user.to_dict())


# ---------------------------------------------------------------------------
# Category Routes
# ---------------------------------------------------------------------------
@app.route("/api/categories", methods=["GET"])
def list_categories():
    cats = Category.query.order_by(Category.name).all()
    return jsonify([c.to_dict() for c in cats])


@app.route("/api/categories", methods=["POST"])
@roles_required(ROLE_ADMIN)
def create_category():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400
    slug = name.lower().replace(" ", "-").replace("&", "and")
    if Category.query.filter_by(slug=slug).first():
        return jsonify({"error": "Category with this name already exists"}), 409
    cat = Category(
        name=name,
        slug=slug,
        description=data.get("description", ""),
        color=data.get("color", "#1F6F78"),
        icon=data.get("icon", "folder"),
    )
    db.session.add(cat)
    db.session.commit()
    log_audit("CREATE_CATEGORY", f"Created category {name}")
    return jsonify(cat.to_dict()), 201


@app.route("/api/categories/<int:category_id>", methods=["PUT"])
@roles_required(ROLE_ADMIN)
def update_category(category_id):
    cat = Category.query.get_or_404(category_id)
    data = request.get_json(force=True, silent=True) or {}
    if "name" in data and data["name"].strip():
        cat.name = data["name"].strip()
        cat.slug = cat.name.lower().replace(" ", "-").replace("&", "and")
    if "description" in data:
        cat.description = data["description"]
    if "color" in data:
        cat.color = data["color"]
    if "icon" in data:
        cat.icon = data["icon"]
    db.session.commit()
    return jsonify(cat.to_dict())


@app.route("/api/categories/<int:category_id>", methods=["DELETE"])
@roles_required(ROLE_ADMIN)
def delete_category(category_id):
    cat = Category.query.get_or_404(category_id)
    if cat.articles:
        return jsonify({"error": f"Cannot delete category with {len(cat.articles)} associated articles"}), 400
    db.session.delete(cat)
    db.session.commit()
    return jsonify({"message": "Category deleted successfully"})


# ---------------------------------------------------------------------------
# Article Routes (Capture, Store, Search, Governance, Lifecycle)
# ---------------------------------------------------------------------------
@app.route("/api/articles", methods=["GET"])
def list_articles():
    curr_user = get_current_user()
    curr_user_id = curr_user.id if curr_user else None

    status_filter = request.args.get("status", STATUS_PUBLISHED)
    if status_filter == "all" and curr_user and curr_user.role == ROLE_ADMIN:
        q = Article.query
    else:
        q = Article.query.filter_by(status=status_filter)

    search = request.args.get("search", "").strip()
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            Article.title.ilike(like),
            Article.content.ilike(like),
            Article.tags.ilike(like),
            Article.summary.ilike(like),
            Article.target_audience.ilike(like),
        ))

    category_slug = request.args.get("category", "").strip()
    if category_slug:
        q = q.join(Category).filter(Category.slug == category_slug)

    tag = request.args.get("tag", "").strip()
    if tag:
        q = q.filter(Article.tags.ilike(f"%{tag}%"))

    evidence = request.args.get("evidence", "").strip()
    if evidence:
        q = q.filter(Article.evidence_level == evidence)

    urgency = request.args.get("urgency", "").strip()
    if urgency:
        q = q.filter(Article.urgency_level == urgency)

    audience = request.args.get("audience", "").strip()
    if audience:
        q = q.filter(Article.target_audience.ilike(f"%{audience}%"))

    if request.args.get("best_practice") == "true":
        q = q.filter_by(is_best_practice=True)

    sort = request.args.get("sort", "recent")
    if sort == "popular":
        q = q.order_by(Article.view_count.desc())
    elif sort == "top_rated":
        articles = q.all()
        articles.sort(key=lambda a: a.avg_rating(), reverse=True)
        return jsonify([a.to_dict(include_content=False, current_user_id=curr_user_id) for a in articles])
    elif sort == "title":
        q = q.order_by(Article.title.asc())
    else:
        q = q.order_by(Article.updated_at.desc())

    articles = q.all()
    return jsonify([a.to_dict(include_content=False, current_user_id=curr_user_id) for a in articles])


@app.route("/api/articles/mine", methods=["GET"])
@login_required
def my_articles():
    curr_user = request.current_user
    articles = Article.query.filter_by(author_id=curr_user.id).order_by(Article.updated_at.desc()).all()
    return jsonify([a.to_dict(include_content=False, current_user_id=curr_user.id) for a in articles])


@app.route("/api/articles/review-queue", methods=["GET"])
@roles_required(ROLE_ADMIN, ROLE_CONTRIBUTOR)
def review_queue():
    articles = Article.query.filter_by(status=STATUS_IN_REVIEW).order_by(Article.updated_at.asc()).all()
    return jsonify([a.to_dict(include_content=False, current_user_id=request.current_user.id) for a in articles])


@app.route("/api/articles/<int:article_id>", methods=["GET"])
def get_article(article_id):
    article = Article.query.get_or_404(article_id)
    curr_user = get_current_user()

    if article.status != STATUS_PUBLISHED:
        if not curr_user or (curr_user.role not in (ROLE_ADMIN, ROLE_CONTRIBUTOR) and article.author_id != curr_user.id):
            return jsonify({"error": "This article is currently undergoing clinical peer review or is in draft."}), 403

    article.view_count += 1
    db.session.commit()
    return jsonify(article.to_dict(include_content=True, current_user_id=curr_user.id if curr_user else None))


@app.route("/api/articles", methods=["POST"])
@roles_required(ROLE_ADMIN, ROLE_CONTRIBUTOR)
def create_article():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    category_id = data.get("category_id")

    if not title or not content or not category_id:
        return jsonify({"error": "Title, content and category are required"}), 400

    if not Category.query.get(category_id):
        return jsonify({"error": "Selected category is invalid"}), 400

    status = data.get("status", STATUS_PUBLISHED)
    if status not in (STATUS_DRAFT, STATUS_IN_REVIEW, STATUS_PUBLISHED):
        status = STATUS_PUBLISHED

    article = Article(
        title=title,
        content=content,
        summary=(data.get("summary") or "")[:500],
        tags=",".join([t.strip() for t in (data.get("tags") or "").split(",") if t.strip()]),
        status=status,
        evidence_level=data.get("evidence_level", "Level II"),
        target_audience=data.get("target_audience", "All Clinical Staff"),
        urgency_level=data.get("urgency_level", "Routine"),
        external_references=data.get("external_references", ""),
        category_id=category_id,
        author_id=request.current_user.id,
    )
    db.session.add(article)
    db.session.commit()

    version = ArticleVersion(
        article_id=article.id,
        title=article.title,
        content=article.content,
        summary=article.summary,
        change_note="Initial version created",
        edited_by_id=request.current_user.id,
    )
    db.session.add(version)
    db.session.commit()

    log_audit("CREATE_ARTICLE", f"Created article #{article.id} '{article.title}' ({article.status})")
    return jsonify(article.to_dict(current_user_id=request.current_user.id)), 201


@app.route("/api/articles/<int:article_id>", methods=["PUT"])
@login_required
def update_article(article_id):
    article = Article.query.get_or_404(article_id)
    user = request.current_user
    if user.role != ROLE_ADMIN and article.author_id != user.id:
        return jsonify({"error": "You can only edit your own articles"}), 403

    data = request.get_json(force=True, silent=True) or {}

    version = ArticleVersion(
        article_id=article.id,
        title=article.title,
        content=article.content,
        summary=article.summary,
        change_note=data.get("change_note", "Clinical content revision"),
        edited_by_id=user.id,
    )
    db.session.add(version)

    if "title" in data and data["title"].strip():
        article.title = data["title"].strip()
    if "content" in data and data["content"].strip():
        article.content = data["content"].strip()
    if "summary" in data:
        article.summary = (data["summary"] or "")[:500]
    if "tags" in data:
        article.tags = ",".join([t.strip() for t in (data["tags"] or "").split(",") if t.strip()])
    if "category_id" in data and Category.query.get(data["category_id"]):
        article.category_id = data["category_id"]
    if "evidence_level" in data:
        article.evidence_level = data["evidence_level"]
    if "target_audience" in data:
        article.target_audience = data["target_audience"]
    if "urgency_level" in data:
        article.urgency_level = data["urgency_level"]
    if "external_references" in data:
        article.external_references = data["external_references"]
    if "status" in data and data["status"] in (STATUS_DRAFT, STATUS_IN_REVIEW, STATUS_PUBLISHED, STATUS_ARCHIVED):
        article.status = data["status"]
    if "is_best_practice" in data and user.role == ROLE_ADMIN:
        article.is_best_practice = bool(data["is_best_practice"])

    article.updated_at = datetime.utcnow()
    db.session.commit()

    log_audit("UPDATE_ARTICLE", f"Updated article #{article.id} '{article.title}'")
    return jsonify(article.to_dict(current_user_id=user.id))


@app.route("/api/articles/<int:article_id>/submit-review", methods=["POST"])
@login_required
def submit_for_review(article_id):
    article = Article.query.get_or_404(article_id)
    if article.author_id != request.current_user.id and request.current_user.role != ROLE_ADMIN:
        return jsonify({"error": "Permission denied"}), 403
    article.status = STATUS_IN_REVIEW
    article.updated_at = datetime.utcnow()
    db.session.commit()
    log_audit("SUBMIT_REVIEW", f"Article #{article.id} submitted for peer review")
    return jsonify(article.to_dict(current_user_id=request.current_user.id))


@app.route("/api/articles/<int:article_id>/review-action", methods=["POST"])
@roles_required(ROLE_ADMIN, ROLE_CONTRIBUTOR)
def review_action(article_id):
    article = Article.query.get_or_404(article_id)
    data = request.get_json(force=True, silent=True) or {}
    action = data.get("action")
    notes = (data.get("notes") or "").strip()

    if action == "approve":
        article.status = STATUS_PUBLISHED
        article.reviewed_by_id = request.current_user.id
        article.reviewed_at = datetime.utcnow()
        article.review_notes = notes or "Approved for clinical publication."
    elif action == "request_changes":
        article.status = STATUS_DRAFT
        article.reviewed_by_id = request.current_user.id
        article.reviewed_at = datetime.utcnow()
        article.review_notes = notes or "Revisions requested by reviewer."
    elif action == "archive":
        article.status = STATUS_ARCHIVED
        article.review_notes = notes or "Archived from active clinical rotation."
    else:
        return jsonify({"error": "Invalid review action"}), 400

    article.updated_at = datetime.utcnow()
    db.session.commit()
    log_audit("REVIEW_ACTION", f"{action.upper()} on article #{article.id} by {request.current_user.name}")
    return jsonify(article.to_dict(current_user_id=request.current_user.id))


@app.route("/api/articles/<int:article_id>", methods=["DELETE"])
@login_required
def delete_article(article_id):
    article = Article.query.get_or_404(article_id)
    user = request.current_user
    if user.role != ROLE_ADMIN and article.author_id != user.id:
        return jsonify({"error": "You can only delete your own articles"}), 403
    title = article.title
    db.session.delete(article)
    db.session.commit()
    log_audit("DELETE_ARTICLE", f"Deleted article #{article_id} '{title}'")
    return jsonify({"message": "Article deleted successfully"})


# ---------------------------------------------------------------------------
# Version History, Diff & Restore
# ---------------------------------------------------------------------------
@app.route("/api/articles/<int:article_id>/versions", methods=["GET"])
def article_versions(article_id):
    Article.query.get_or_404(article_id)
    versions = ArticleVersion.query.filter_by(article_id=article_id).order_by(ArticleVersion.edited_at.desc()).all()
    return jsonify([v.to_dict() for v in versions])


@app.route("/api/articles/<int:article_id>/versions/<int:version_id>", methods=["GET"])
def get_version(article_id, version_id):
    Article.query.get_or_404(article_id)
    v = ArticleVersion.query.filter_by(id=version_id, article_id=article_id).first_or_404()
    return jsonify(v.to_dict())


@app.route("/api/articles/<int:article_id>/versions/<int:version_id>/restore", methods=["POST"])
@login_required
def restore_version(article_id, version_id):
    article = Article.query.get_or_404(article_id)
    user = request.current_user
    if user.role != ROLE_ADMIN and article.author_id != user.id:
        return jsonify({"error": "Permission denied"}), 403

    v = ArticleVersion.query.filter_by(id=version_id, article_id=article_id).first_or_404()

    backup = ArticleVersion(
        article_id=article.id,
        title=article.title,
        content=article.content,
        summary=article.summary,
        change_note=f"Snapshot prior to restoring version #{version_id}",
        edited_by_id=user.id,
    )
    db.session.add(backup)

    article.title = v.title
    article.content = v.content
    if v.summary:
        article.summary = v.summary
    article.updated_at = datetime.utcnow()
    db.session.commit()

    log_audit("RESTORE_VERSION", f"Restored version #{version_id} for article #{article.id}")
    return jsonify(article.to_dict(current_user_id=user.id))


@app.route("/api/articles/<int:article_id>/flag", methods=["POST"])
@roles_required(ROLE_ADMIN)
def flag_best_practice(article_id):
    article = Article.query.get_or_404(article_id)
    article.is_best_practice = not article.is_best_practice
    db.session.commit()
    log_audit("FLAG_BEST_PRACTICE", f"Flagged article #{article.id} as best practice: {article.is_best_practice}")
    return jsonify(article.to_dict(current_user_id=request.current_user.id))


# ---------------------------------------------------------------------------
# Bookmarks (Ward Favorites)
# ---------------------------------------------------------------------------
@app.route("/api/bookmarks", methods=["GET"])
@login_required
def list_bookmarks():
    user = request.current_user
    bookmarks = Bookmark.query.filter_by(user_id=user.id).order_by(Bookmark.created_at.desc()).all()
    articles = [b.article for b in bookmarks if b.article and b.article.status == STATUS_PUBLISHED]
    return jsonify([a.to_dict(include_content=False, current_user_id=user.id) for a in articles])


@app.route("/api/articles/<int:article_id>/bookmark", methods=["POST"])
@login_required
def toggle_bookmark(article_id):
    Article.query.get_or_404(article_id)
    user = request.current_user
    bookmark = Bookmark.query.filter_by(article_id=article_id, user_id=user.id).first()
    if bookmark:
        db.session.delete(bookmark)
        is_bookmarked = False
    else:
        bm = Bookmark(article_id=article_id, user_id=user.id)
        db.session.add(bm)
        is_bookmarked = True
    db.session.commit()
    return jsonify({"is_bookmarked": is_bookmarked})


# ---------------------------------------------------------------------------
# Comments & Peer Ratings
# ---------------------------------------------------------------------------
@app.route("/api/articles/<int:article_id>/comments", methods=["GET"])
def list_comments(article_id):
    Article.query.get_or_404(article_id)
    comments = Comment.query.filter_by(article_id=article_id).order_by(Comment.created_at.desc()).all()
    return jsonify([c.to_dict() for c in comments])


@app.route("/api/articles/<int:article_id>/comments", methods=["POST"])
@login_required
def add_comment(article_id):
    Article.query.get_or_404(article_id)
    data = request.get_json(force=True, silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Comment cannot be empty"}), 400
    comment = Comment(article_id=article_id, user_id=request.current_user.id, content=content)
    db.session.add(comment)
    db.session.commit()
    return jsonify(comment.to_dict()), 201


@app.route("/api/articles/<int:article_id>/rate", methods=["POST"])
@login_required
def rate_article(article_id):
    Article.query.get_or_404(article_id)
    data = request.get_json(force=True, silent=True) or {}
    value = data.get("value")
    if value not in (1, 2, 3, 4, 5):
        return jsonify({"error": "Rating must be an integer from 1 to 5"}), 400

    rating = Rating.query.filter_by(article_id=article_id, user_id=request.current_user.id).first()
    if rating:
        rating.value = value
    else:
        rating = Rating(article_id=article_id, user_id=request.current_user.id, value=value)
        db.session.add(rating)
    db.session.commit()

    article = Article.query.get(article_id)
    return jsonify({
        "avg_rating": article.avg_rating(),
        "rating_count": len(article.ratings),
        "user_rating": value,
    })


# ---------------------------------------------------------------------------
# Knowledge Gap & Protocol Requests
# ---------------------------------------------------------------------------
@app.route("/api/requests", methods=["GET"])
def list_knowledge_requests():
    curr_user = get_current_user()
    curr_user_id = curr_user.id if curr_user else None

    status = request.args.get("status")
    q = KnowledgeRequest.query
    if status:
        q = q.filter_by(status=status)
    requests_list = q.order_by(KnowledgeRequest.created_at.desc()).all()
    requests_list.sort(key=lambda r: len(r.upvotes), reverse=True)
    return jsonify([r.to_dict(current_user_id=curr_user_id) for r in requests_list])


@app.route("/api/requests", methods=["POST"])
@login_required
def create_knowledge_request():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    if not title or not description:
        return jsonify({"error": "Title and description are required"}), 400

    kr = KnowledgeRequest(
        title=title,
        description=description,
        department=data.get("department", request.current_user.department or ""),
        urgency=data.get("urgency", "Important"),
        requested_by_id=request.current_user.id,
    )
    db.session.add(kr)
    db.session.commit()
    db.session.add(RequestUpvote(request_id=kr.id, user_id=request.current_user.id))
    db.session.commit()
    log_audit("CREATE_REQUEST", f"Knowledge request #{kr.id} '{title}'")
    return jsonify(kr.to_dict(current_user_id=request.current_user.id)), 201


@app.route("/api/requests/<int:req_id>/upvote", methods=["POST"])
@login_required
def upvote_request(req_id):
    kr = KnowledgeRequest.query.get_or_404(req_id)
    user = request.current_user
    upvote = RequestUpvote.query.filter_by(request_id=kr.id, user_id=user.id).first()
    if upvote:
        db.session.delete(upvote)
        has_upvoted = False
    else:
        db.session.add(RequestUpvote(request_id=kr.id, user_id=user.id))
        has_upvoted = True
    db.session.commit()
    return jsonify({"upvote_count": len(kr.upvotes), "has_upvoted": has_upvoted})


@app.route("/api/requests/<int:req_id>/claim", methods=["POST"])
@roles_required(ROLE_ADMIN, ROLE_CONTRIBUTOR)
def claim_request(req_id):
    kr = KnowledgeRequest.query.get_or_404(req_id)
    kr.assigned_to_id = request.current_user.id
    kr.status = "in_progress"
    db.session.commit()
    return jsonify(kr.to_dict(current_user_id=request.current_user.id))


@app.route("/api/requests/<int:req_id>/fulfill", methods=["POST"])
@roles_required(ROLE_ADMIN, ROLE_CONTRIBUTOR)
def fulfill_request(req_id):
    kr = KnowledgeRequest.query.get_or_404(req_id)
    data = request.get_json(force=True, silent=True) or {}
    article_id = data.get("article_id")
    if article_id:
        Article.query.get_or_404(article_id)
        kr.article_id = article_id
    kr.status = "fulfilled"
    db.session.commit()
    return jsonify(kr.to_dict(current_user_id=request.current_user.id))


# ---------------------------------------------------------------------------
# Clinical Advisories (Hospital Urgent Broadcast Banner)
# ---------------------------------------------------------------------------
@app.route("/api/advisories", methods=["GET"])
def list_advisories():
    advisories = ClinicalAdvisory.query.filter_by(is_active=True).order_by(ClinicalAdvisory.created_at.desc()).all()
    return jsonify([a.to_dict() for a in advisories])


@app.route("/api/advisories", methods=["POST"])
@roles_required(ROLE_ADMIN)
def create_advisory():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    if not title or not message:
        return jsonify({"error": "Title and message are required"}), 400

    advisory = ClinicalAdvisory(
        title=title,
        message=message,
        level=data.get("level", "warning"),
        created_by_id=request.current_user.id,
    )
    db.session.add(advisory)
    db.session.commit()
    log_audit("CREATE_ADVISORY", f"Advisory broadcast: {title}")
    return jsonify(advisory.to_dict()), 201


@app.route("/api/advisories/<int:advisory_id>/toggle", methods=["PUT"])
@roles_required(ROLE_ADMIN)
def toggle_advisory(advisory_id):
    advisory = ClinicalAdvisory.query.get_or_404(advisory_id)
    advisory.is_active = not advisory.is_active
    db.session.commit()
    return jsonify(advisory.to_dict())


@app.route("/api/advisories/<int:advisory_id>", methods=["DELETE"])
@roles_required(ROLE_ADMIN)
def delete_advisory(advisory_id):
    advisory = ClinicalAdvisory.query.get_or_404(advisory_id)
    db.session.delete(advisory)
    db.session.commit()
    return jsonify({"message": "Advisory removed"})


# ---------------------------------------------------------------------------
# Clinical Consults & Q&A Board
# ---------------------------------------------------------------------------
@app.route("/api/questions", methods=["GET"])
def list_questions():
    questions = ClinicalQuestion.query.order_by(ClinicalQuestion.created_at.desc()).all()
    return jsonify([q.to_dict() for q in questions])


@app.route("/api/questions", methods=["POST"])
@login_required
def create_question():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        return jsonify({"error": "Title and content are required"}), 400

    q = ClinicalQuestion(
        title=title,
        content=content,
        category_id=data.get("category_id"),
        author_id=request.current_user.id,
    )
    db.session.add(q)
    db.session.commit()
    return jsonify(q.to_dict()), 201


@app.route("/api/questions/<int:q_id>", methods=["GET"])
def get_question(q_id):
    q = ClinicalQuestion.query.get_or_404(q_id)
    data = q.to_dict()
    data["answers"] = [a.to_dict() for a in q.answers]
    return jsonify(data)


@app.route("/api/questions/<int:q_id>/answers", methods=["POST"])
@login_required
def add_answer(q_id):
    ClinicalQuestion.query.get_or_404(q_id)
    data = request.get_json(force=True, silent=True) or {}
    content = (data.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Answer cannot be empty"}), 400

    ans = ClinicalAnswer(question_id=q_id, author_id=request.current_user.id, content=content)
    db.session.add(ans)
    db.session.commit()
    return jsonify(ans.to_dict()), 201


@app.route("/api/answers/<int:ans_id>/accept", methods=["POST"])
@login_required
def accept_answer(ans_id):
    ans = ClinicalAnswer.query.get_or_404(ans_id)
    q = ans.question
    if q.author_id != request.current_user.id and request.current_user.role != ROLE_ADMIN:
        return jsonify({"error": "Only the question author or Admin can verify an answer"}), 403

    for a in q.answers:
        a.is_accepted = (a.id == ans.id)
    q.is_resolved = True
    db.session.commit()
    return jsonify({"message": "Answer verified as hospital consensus"})


# ---------------------------------------------------------------------------
# Dashboard Analytics & KM Metrics
# ---------------------------------------------------------------------------
@app.route("/api/dashboard/stats", methods=["GET"])
@login_required
def dashboard_stats():
    total_articles = Article.query.filter_by(status=STATUS_PUBLISHED).count()
    total_drafts = Article.query.filter_by(status=STATUS_DRAFT).count()
    total_in_review = Article.query.filter_by(status=STATUS_IN_REVIEW).count()
    total_archived = Article.query.filter_by(status=STATUS_ARCHIVED).count()
    total_contributors = db.session.query(User.id).join(Article, Article.author_id == User.id).distinct().count()
    total_views = db.session.query(func.sum(Article.view_count)).scalar() or 0
    best_practice_count = Article.query.filter_by(is_best_practice=True).count()
    open_requests_count = KnowledgeRequest.query.filter_by(status="open").count()

    most_viewed = Article.query.filter_by(status=STATUS_PUBLISHED).order_by(Article.view_count.desc()).limit(5).all()

    category_breakdown = []
    for cat in Category.query.all():
        count = Article.query.filter_by(category_id=cat.id, status=STATUS_PUBLISHED).count()
        category_breakdown.append({"name": cat.name, "color": cat.color, "count": count, "slug": cat.slug})

    recent = Article.query.filter_by(status=STATUS_PUBLISHED).order_by(Article.created_at.desc()).limit(5).all()

    top_contributors = db.session.query(
        User.name, User.department, User.role, func.count(Article.id).label("cnt")
    ).join(Article, Article.author_id == User.id).filter(Article.status == STATUS_PUBLISHED).group_by(User.id).order_by(desc("cnt")).limit(5).all()

    evidence_breakdown = []
    for ev in ["Level I", "Level II", "Level III", "Level IV"]:
        cnt = Article.query.filter_by(evidence_level=ev, status=STATUS_PUBLISHED).count()
        evidence_breakdown.append({"level": ev, "count": cnt})

    return jsonify({
        "total_articles": total_articles,
        "total_drafts": total_drafts,
        "total_in_review": total_in_review,
        "total_archived": total_archived,
        "total_contributors": total_contributors,
        "total_views": int(total_views),
        "best_practice_count": best_practice_count,
        "open_requests_count": open_requests_count,
        "most_viewed": [a.to_dict(include_content=False, current_user_id=request.current_user.id) for a in most_viewed],
        "category_breakdown": category_breakdown,
        "recent_articles": [a.to_dict(include_content=False, current_user_id=request.current_user.id) for a in recent],
        "top_contributors": [{"name": n, "department": dept, "role": r, "count": c} for n, dept, r, c in top_contributors],
        "evidence_breakdown": evidence_breakdown,
    })


# ---------------------------------------------------------------------------
# Admin Hub & Data Export
# ---------------------------------------------------------------------------
@app.route("/api/admin/users", methods=["GET"])
@roles_required(ROLE_ADMIN)
def admin_users():
    users = User.query.order_by(User.name).all()
    return jsonify([u.to_dict() for u in users])


@app.route("/api/admin/users/<int:user_id>/role", methods=["PUT"])
@roles_required(ROLE_ADMIN)
def admin_change_role(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(force=True, silent=True) or {}
    new_role = data.get("role")
    if new_role not in (ROLE_ADMIN, ROLE_CONTRIBUTOR, ROLE_VIEWER):
        return jsonify({"error": "Invalid role specified"}), 400
    user.role = new_role
    db.session.commit()
    log_audit("CHANGE_USER_ROLE", f"Changed {user.email} role to {new_role}")
    return jsonify(user.to_dict())


@app.route("/api/admin/users/<int:user_id>/status", methods=["PUT"])
@roles_required(ROLE_ADMIN)
def admin_toggle_user_status(user_id):
    user = User.query.get_or_404(user_id)
    if user.id == request.current_user.id:
        return jsonify({"error": "Cannot deactivate your own account"}), 400
    user.is_active = not user.is_active
    db.session.commit()
    log_audit("TOGGLE_USER_STATUS", f"User {user.email} active={user.is_active}")
    return jsonify(user.to_dict())


@app.route("/api/admin/audit-logs", methods=["GET"])
@roles_required(ROLE_ADMIN)
def admin_audit_logs():
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(100).all()
    return jsonify([l.to_dict() for l in logs])


@app.route("/api/admin/export", methods=["GET"])
@roles_required(ROLE_ADMIN)
def export_database():
    """Export complete knowledge base as a structured JSON backup."""
    articles = [a.to_dict(include_content=True) for a in Article.query.all()]
    categories = [c.to_dict() for c in Category.query.all()]
    users = [u.to_dict() for u in User.query.all()]
    requests_data = [r.to_dict() for r in KnowledgeRequest.query.all()]

    data = {
        "hospital_portal": "MedKnow Healthcare Knowledge Management Portal",
        "exported_at": datetime.utcnow().isoformat(),
        "exported_by": request.current_user.name,
        "articles": articles,
        "categories": categories,
        "users": users,
        "knowledge_requests": requests_data,
    }
    return Response(
        json.dumps(data, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment;filename=medknow_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"},
    )


# ---------------------------------------------------------------------------
# Initial Categories Setup (Clean Categories with No Fake Users)
# ---------------------------------------------------------------------------
def seed_initial_categories():
    if Category.query.first():
        return

    categories_data = [
        ("Clinical Protocols", "Standardised, evidence-based procedures for clinical scenarios.", "#1F6F78", "activity"),
        ("Critical Care & ER", "Resuscitation, shock algorithms, and high-acuity trauma protocols.", "#C1503F", "alert-circle"),
        ("Drug Safety & Dosing", "High-alert medication dosing, renal adjustments, and antidote guides.", "#C97A2B", "shield"),
        ("Disease Reference", "Diagnostic criteria, etiology, outpatient pathways, and staging.", "#7FA98E", "book-open"),
        ("Case Studies & Reviews", "De-identified clinical case reviews and decision lessons.", "#8060B8", "award"),
        ("Standard Operating Procedures", "Inter-departmental handovers, nursing workflows, and infection control.", "#3C6E9A", "file-text"),
        ("Clinical FAQs", "Frequently asked clinical guidelines and triage questions.", "#5C6E73", "help-circle"),
    ]
    for name, desc_text, color, icon in categories_data:
        cat = Category(name=name, slug=name.lower().replace(" ", "-").replace("&", "and"), description=desc_text, color=color, icon=icon)
        db.session.add(cat)
    db.session.commit()


with app.app_context():
    db.create_all()
    seed_initial_categories()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
