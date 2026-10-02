const ROLE_LABELS = {
  super_admin: 'Super Administrateur',
  admin: 'Administrateur',
  operator: 'Opérateur',
  analyst: 'Analyste',
  reader: 'Lecteur',
};

export function formatRoleLabel(roleOrRoles, roleLabel) {
  if (roleLabel) return roleLabel;
  const role = Array.isArray(roleOrRoles) ? roleOrRoles[0] : roleOrRoles;
  return ROLE_LABELS[role] || role || 'Utilisateur';
}

export default ROLE_LABELS;
