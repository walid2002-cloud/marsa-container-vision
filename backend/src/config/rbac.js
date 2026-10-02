/**
 * Phase 6 — Définition centralisée RBAC (rôles + permissions).
 *
 * Source de vérité pour l'amorçage en base (roles, permissions, role_permissions)
 * et pour les vérifications de permissions. Modifier ici pour faire évoluer les
 * droits ; le seed est idempotent au démarrage.
 */

// Liste complète des permissions {name, label, category}.
const PERMISSIONS = [
  { name: 'users.read', label: 'Voir les utilisateurs', category: 'Utilisateurs' },
  { name: 'users.create', label: 'Créer un utilisateur', category: 'Utilisateurs' },
  { name: 'users.update', label: 'Modifier un utilisateur', category: 'Utilisateurs' },
  { name: 'users.delete', label: 'Désactiver un utilisateur', category: 'Utilisateurs' },
  { name: 'roles.manage', label: 'Gérer les rôles et permissions', category: 'Sécurité' },
  { name: 'containers.search', label: 'Rechercher un conteneur', category: 'Conteneurs' },
  { name: 'containers.read_tracking', label: 'Consulter le suivi conteneur', category: 'Conteneurs' },
  { name: 'containers.manage_tracking', label: 'Gérer le suivi conteneur', category: 'Conteneurs' },
  { name: 'cameras.read', label: 'Consulter les caméras', category: 'Caméras' },
  { name: 'cameras.manage', label: 'Gérer / scanner les caméras', category: 'Caméras' },
  { name: 'uploads.create', label: 'Analyser une image (upload)', category: 'Vision' },
  { name: 'uploads.read', label: 'Consulter les analyses image', category: 'Vision' },
  { name: 'uploads.delete', label: 'Supprimer une analyse image', category: 'Vision' },
  { name: 'terminal_map.read', label: 'Consulter la carte du terminal', category: 'Carte' },
  { name: 'alerts.read', label: 'Consulter les alertes', category: 'Alertes' },
  { name: 'alerts.resolve', label: 'Traiter une alerte', category: 'Alertes' },
  { name: 'alerts.ignore', label: 'Ignorer une alerte', category: 'Alertes' },
  { name: 'alerts.manage', label: 'Gérer les alertes (checks)', category: 'Alertes' },
  { name: 'notifications.read', label: 'Consulter les notifications', category: 'Notifications' },
  { name: 'notifications.retry', label: 'Réessayer une notification', category: 'Notifications' },
  { name: 'notifications.manage_settings', label: 'Gérer les paramètres notifications', category: 'Notifications' },
  { name: 'ocr.analyze', label: 'Lancer une analyse OCR', category: 'Vision' },
  { name: 'audit.read', label: "Consulter le journal d'audit", category: 'Sécurité' },
  { name: 'settings.manage', label: 'Gérer la configuration système', category: 'Sécurité' },
];

const ALL_PERMISSION_NAMES = PERMISSIONS.map((p) => p.name);

// Rôles {name, label, description, is_system}.
const ROLES = [
  { name: 'super_admin', label: 'Super Admin', description: 'Accès complet, gestion sécurité et utilisateurs.', is_system: 1 },
  { name: 'admin', label: 'Admin', description: 'Gestion opérationnelle complète.', is_system: 1 },
  { name: 'operator', label: 'Opérateur', description: 'Recherche, caméras, traitement des alertes.', is_system: 1 },
  { name: 'analyst', label: 'Analyste', description: 'Consultation dashboard, historique, analytics, audit.', is_system: 1 },
  { name: 'reader', label: 'Lecteur', description: 'Consultation seule des informations autorisées.', is_system: 1 },
];

// Attribution rôle -> permissions.
const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSION_NAMES,
  admin: [
    'users.read',
    'containers.search', 'containers.read_tracking', 'containers.manage_tracking',
    'cameras.read', 'cameras.manage',
    'uploads.create', 'uploads.read', 'uploads.delete',
    'terminal_map.read',
    'alerts.read', 'alerts.resolve', 'alerts.ignore', 'alerts.manage',
    'notifications.read', 'notifications.retry', 'notifications.manage_settings',
    'ocr.analyze', 'audit.read', 'settings.manage',
  ],
  operator: [
    'containers.search', 'containers.read_tracking',
    'cameras.read',
    'uploads.create', 'uploads.read',
    'terminal_map.read',
    'alerts.read', 'alerts.resolve', 'alerts.ignore',
    'ocr.analyze',
  ],
  analyst: [
    'containers.search', 'containers.read_tracking',
    'cameras.read',
    'uploads.read',
    'terminal_map.read',
    'alerts.read',
    'notifications.read',
    'audit.read',
  ],
  reader: [
    'containers.search', 'containers.read_tracking',
    'cameras.read',
    'uploads.read',
    'terminal_map.read',
    'alerts.read',
    'notifications.read',
  ],
};

// Correspondance rôle hérité (ENUM admins.role) -> rôle RBAC pour la migration.
const LEGACY_ROLE_MAP = {
  admin: 'admin',
  operator: 'operator',
};

const SUPER_ADMIN_ROLE = 'super_admin';
// Email du Super Admin par défaut (ne jamais bloquer l'accès).
const DEFAULT_SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@marsamaroc.com';

const RBAC_ENABLED = String(process.env.RBAC_ENABLED || 'true').toLowerCase() !== 'false';

module.exports = {
  PERMISSIONS,
  ALL_PERMISSION_NAMES,
  ROLES,
  ROLE_PERMISSIONS,
  LEGACY_ROLE_MAP,
  SUPER_ADMIN_ROLE,
  DEFAULT_SUPER_ADMIN_EMAIL,
  RBAC_ENABLED,
  permissionsForRole(roleName) {
    return ROLE_PERMISSIONS[roleName] || [];
  },
};
