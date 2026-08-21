"""
Database models for the Healthcare Knowledge Management Portal.
Supports SQLite and PostgreSQL.
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

ROLE_ADMIN = "admin"
ROLE_CONTRIBUTOR = "contributor"   # doctors / clinical specialists who can author articles
ROLE_VIEWER = "viewer"             # nurses / staff / residents (read, comment, rate, bookmark, request)

STATUS_DRAFT = "draft"
STATUS_IN_REVIEW = "in_review"     # submitted for peer review / clinical approval
STATUS_PUBLISHED = "published"
STATUS_ARCHIVED = "archived"       # KM retirement lifecycle

EVIDENCE_LEVELS = [
    ("Level I", "Systematic Review / Meta-analysis"),
    ("Level II", "Randomised Controlled Trial (RCT)"),
    ("Level III", "Cohort / Case-Control Study"),
    ("Level IV", "Clinical Consensus / Expert Guidelines"),
]

URGENCY_LEVELS = ["Routine", "Important", "Critical / Emergency"]


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(180), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default=ROLE_VIEWER)
    department = db.Column(db.String(120), default="")
    title = db.Column(db.String(120), default="")
    avatar_color = db.Column(db.String(20), default="#1F6F78")
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    articles = db.relationship("Article", foreign_keys="Article.author_id", backref="author", lazy=True)
    comments = db.relationship("Comment", backref="user", lazy=True)
    ratings = db.relationship("Rating", backref="user", lazy=True)
    bookmarks = db.relationship("Bookmark", backref="user", lazy=True, cascade="all, delete-orphan")
    requests = db.relationship("KnowledgeRequest", foreign_keys="KnowledgeRequest.requested_by_id", backref="requester", lazy=True)

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "department": self.department,
            "title": self.title,
            "avatar_color": self.avatar_color,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    slug = db.Column(db.String(120), unique=True, nullable=False)
    description = db.Column(db.String(255), default="")
    color = db.Column(db.String(20), default="#1F6F78")
    icon = db.Column(db.String(30), default="folder")

    articles = db.relationship("Article", backref="category", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "description": self.description,
            "color": self.color,
            "icon": self.icon,
            "article_count": len([a for a in self.articles if a.status == STATUS_PUBLISHED]),
        }


class Article(db.Model):
    __tablename__ = "articles"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    summary = db.Column(db.String(500), default="")
    tags = db.Column(db.String(300), default="")  # comma separated
    status = db.Column(db.String(20), default=STATUS_PUBLISHED)
    is_best_practice = db.Column(db.Boolean, default=False)
    view_count = db.Column(db.Integer, default=0)

    # Advanced Clinical Metadata
    evidence_level = db.Column(db.String(50), default="Level II")
    target_audience = db.Column(db.String(150), default="All Clinical Staff")
    urgency_level = db.Column(db.String(50), default="Routine")
    external_references = db.Column(db.Text, default="")
    
    # KM Review / Governance
    review_notes = db.Column(db.Text, default="")
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)

    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    reviewer = db.relationship("User", foreign_keys=[reviewed_by_id])
    versions = db.relationship("ArticleVersion", backref="article", lazy=True,
                                order_by="ArticleVersion.edited_at.desc()",
                                cascade="all, delete-orphan")
    comments = db.relationship("Comment", backref="article", lazy=True,
                                order_by="Comment.created_at.desc()",
                                cascade="all, delete-orphan")
    ratings = db.relationship("Rating", backref="article", lazy=True,
                               cascade="all, delete-orphan")
    bookmarks = db.relationship("Bookmark", backref="article", lazy=True,
                                 cascade="all, delete-orphan")

    def tag_list(self):
        return [t.strip() for t in self.tags.split(",") if t.strip()]

    def avg_rating(self):
        if not self.ratings:
            return 0
        return round(sum(r.value for r in self.ratings) / len(self.ratings), 1)

    def estimated_read_time(self):
        words = len((self.content or "").split())
        return max(1, round(words / 180))

    def to_dict(self, include_content=True, current_user_id=None):
        is_bookmarked = False
        user_rating = 0
        if current_user_id:
            is_bookmarked = any(b.user_id == current_user_id for b in self.bookmarks)
            for r in self.ratings:
                if r.user_id == current_user_id:
                    user_rating = r.value
                    break

        data = {
            "id": self.id,
            "title": self.title,
            "summary": self.summary,
            "tags": self.tag_list(),
            "status": self.status,
            "is_best_practice": self.is_best_practice,
            "view_count": self.view_count,
            "evidence_level": self.evidence_level,
            "target_audience": self.target_audience,
            "urgency_level": self.urgency_level,
            "external_references": self.external_references,
            "read_time_min": self.estimated_read_time(),
            "review_notes": self.review_notes,
            "reviewed_by": self.reviewer.name if self.reviewer else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "category": self.category.to_dict() if self.category else None,
            "author": {
                "id": self.author.id,
                "name": self.author.name,
                "role": self.author.role,
                "department": self.author.department,
                "title": self.author.title,
            } if self.author else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "avg_rating": self.avg_rating(),
            "rating_count": len(self.ratings),
            "comment_count": len(self.comments),
            "version_count": len(self.versions),
            "is_bookmarked": is_bookmarked,
            "user_rating": user_rating,
        }
        if include_content:
            data["content"] = self.content
        return data


class ArticleVersion(db.Model):
    """Audit trail: snapshot taken every time an article is edited."""
    __tablename__ = "article_versions"

    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey("articles.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    summary = db.Column(db.String(500), default="")
    change_note = db.Column(db.String(255), default="")
    edited_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    edited_at = db.Column(db.DateTime, default=datetime.utcnow)

    edited_by = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "article_id": self.article_id,
            "title": self.title,
            "content": self.content,
            "summary": self.summary,
            "change_note": self.change_note,
            "edited_by": self.edited_by.name if self.edited_by else "Unknown",
            "edited_by_id": self.edited_by_id,
            "edited_at": self.edited_at.isoformat() if self.edited_at else None,
        }


class Bookmark(db.Model):
    """Staff favorite articles for quick access during shifts."""
    __tablename__ = "bookmarks"

    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey("articles.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint("article_id", "user_id", name="uq_article_user_bookmark"),)


class KnowledgeRequest(db.Model):
    """Protocol & knowledge gap requests from clinical staff."""
    __tablename__ = "knowledge_requests"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=False)
    department = db.Column(db.String(120), default="")
    urgency = db.Column(db.String(50), default="Important")
    status = db.Column(db.String(30), default="open")  # open, in_progress, fulfilled, closed
    
    requested_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    assigned_to_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    article_id = db.Column(db.Integer, db.ForeignKey("articles.id"), nullable=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_to = db.relationship("User", foreign_keys=[assigned_to_id])
    article = db.relationship("Article", foreign_keys=[article_id])
    upvotes = db.relationship("RequestUpvote", backref="request", lazy=True, cascade="all, delete-orphan")

    def to_dict(self, current_user_id=None):
        has_upvoted = False
        if current_user_id:
            has_upvoted = any(u.user_id == current_user_id for u in self.upvotes)
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "department": self.department,
            "urgency": self.urgency,
            "status": self.status,
            "requester": {"id": self.requester.id, "name": self.requester.name, "role": self.requester.role} if self.requester else None,
            "assigned_to": {"id": self.assigned_to.id, "name": self.assigned_to.name} if self.assigned_to else None,
            "article_id": self.article_id,
            "upvote_count": len(self.upvotes),
            "has_upvoted": has_upvoted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RequestUpvote(db.Model):
    __tablename__ = "request_upvotes"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("knowledge_requests.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    __table_args__ = (db.UniqueConstraint("request_id", "user_id", name="uq_request_user_upvote"),)


class ClinicalAdvisory(db.Model):
    """Urgent clinical notices and hospital broadcasts."""
    __tablename__ = "clinical_advisories"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    level = db.Column(db.String(30), default="warning")  # info, warning, critical
    is_active = db.Column(db.Boolean, default=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "level": self.level,
            "is_active": self.is_active,
            "author": self.author.name if self.author else "Hospital Admin",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ClinicalQuestion(db.Model):
    """Clinical Consult & Q&A discussions."""
    __tablename__ = "clinical_questions"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    is_resolved = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship("User", foreign_keys=[author_id])
    category = db.relationship("Category")
    answers = db.relationship("ClinicalAnswer", backref="question", lazy=True,
                              order_by="ClinicalAnswer.created_at.asc()",
                              cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "category": self.category.to_dict() if self.category else None,
            "author": {"id": self.author.id, "name": self.author.name, "department": self.author.department} if self.author else None,
            "is_resolved": self.is_resolved,
            "answer_count": len(self.answers),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ClinicalAnswer(db.Model):
    __tablename__ = "clinical_answers"

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey("clinical_questions.id"), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_accepted = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship("User", foreign_keys=[author_id])

    def to_dict(self):
        return {
            "id": self.id,
            "question_id": self.question_id,
            "author": {"id": self.author.id, "name": self.author.name, "role": self.author.role, "department": self.author.department} if self.author else None,
            "content": self.content,
            "is_accepted": self.is_accepted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Comment(db.Model):
    __tablename__ = "comments"

    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey("articles.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    content = db.Column(db.String(1000), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "content": self.content,
            "user": {"id": self.user.id, "name": self.user.name, "role": self.user.role, "department": self.user.department} if self.user else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Rating(db.Model):
    __tablename__ = "ratings"

    id = db.Column(db.Integer, primary_key=True)
    article_id = db.Column(db.Integer, db.ForeignKey("articles.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    value = db.Column(db.Integer, nullable=False)  # 1-5

    __table_args__ = (db.UniqueConstraint("article_id", "user_id", name="uq_article_user_rating"),)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    action = db.Column(db.String(100), nullable=False)
    details = db.Column(db.String(500), default="")
    ip_address = db.Column(db.String(60), default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "user_name": self.user.name if self.user else "System",
            "action": self.action,
            "details": self.details,
            "ip_address": self.ip_address,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
