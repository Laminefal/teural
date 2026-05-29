# Plan : Teranga SaaS multi-rôles

## 1. Modèle de données

Nouvelles structures :

- **enum `app_role`** : `owner`, `agent`
- **table `shops`** : `id`, `name`, `owner_id` (uuid → auth.users), timestamps
- **table `user_roles`** : `id`, `user_id`, `shop_id`, `role`, unique(user_id, shop_id)
- Fonctions security-definer :
  - `get_user_shop_id(_user_id uuid)` → renvoie la boutique de l'utilisateur
  - `is_shop_owner(_user_id uuid, _shop_id uuid)` → bool
  - `is_shop_member(_user_id uuid, _shop_id uuid)` → bool

Modification des tables existantes (`products`, `sales`, `expenses`, `debts`) :
- Ajout colonne `shop_id` (uuid, NOT NULL après migration)
- `user_id` reste pour tracer qui a créé la ligne
- Migration des données existantes : chaque user devient owner d'une nouvelle boutique, ses données héritent du `shop_id`

Trigger `handle_new_user` mis à jour : à l'inscription, crée la boutique + rôle owner + profile.

## 2. RLS (par boutique, pas par user)

Pour `products`, `sales`, `expenses`, `debts` :
- **SELECT / UPDATE / INSERT** : tout membre de la boutique (`is_shop_member`)
- **DELETE** : uniquement le owner (`is_shop_owner`)

Pour `user_roles` / `shops` :
- Lecture : membres de la boutique
- Écriture : owner uniquement

## 3. Gestion des agents (côté serveur)

Server function `createAgent` dans `src/lib/agents.functions.ts` :
- Protégée par `requireSupabaseAuth`
- Vérifie que l'appelant est owner de sa boutique
- Utilise `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`
- Insère ligne dans `user_roles` (role=agent, shop_id)
- Server function `deleteAgent` (soft : supprime user_roles + désactive auth user)

Wiring `attachSupabaseAuth` dans `src/start.ts` si pas déjà présent.

## 4. UI — nouvelles permissions

Hook `useRole()` exposant `{ role, shopId, isOwner, isAgent }` chargé après auth.

**Sidebar adaptative** :
- Owner : Tableau de bord · Historiques (ventes, dépenses, dettes, stock) · **Équipe** · Paramètres boutique
- Agent : Tableau de bord · Produits · Ventes · Dépenses · Dettes

**Pages modifiées** :
- `products.tsx`, `sales.tsx`, `expenses.tsx`, `debts.tsx` :
  - Si owner → mode lecture seule : pas de bouton "Nouveau", pas d'édition. Colonne "Agent" affichant qui a créé.
  - Boutons **Annuler / Rétablir** visibles pour agent ET owner.
  - Boutons **Supprimer** visibles uniquement owner.
- Nouvelle page `_app/team.tsx` (owner only) :
  - Liste des agents (email, date d'ajout, nombre de ventes)
  - Formulaire "Ajouter un agent" (email + mot de passe temporaire)
  - Action "Retirer l'agent"
  - Route guard : redirige vers `/dashboard` si pas owner

**Dashboard** : reste accessible aux deux, avec sélecteur "Filtrer par agent" pour le owner.

## 5. Migration des données existantes

Pour chaque user actuel :
1. Créer une `shop` (name = profiles.shop_name, owner_id = user.id)
2. Insérer `user_roles` (role=owner)
3. UPDATE products/sales/expenses/debts SET shop_id = ... WHERE user_id = ...

## Détails techniques

- Triggers existants (`decrement_stock`, `handle_sale_cancellation`, etc.) inchangés — ils utilisent `user_id` qui reste en place pour tracer l'auteur.
- `attachSupabaseAuth` requis pour que les server fns reçoivent le bearer.
- Page `team.tsx` utilise React Query + `useServerFn` pour CRUD agents.
- Le owner crée son compte normalement via `/login` (signup). Les agents ne peuvent PAS signup eux-mêmes — on désactive le signup public ? **Question ouverte** : je laisse le signup public ouvert (chaque signup = nouvelle boutique owner) ; les agents sont créés uniquement par leur owner.

## Fichiers touchés

- Migration SQL (1 grosse migration)
- `src/lib/agents.functions.ts` (nouveau)
- `src/lib/use-role.ts` (nouveau hook)
- `src/start.ts` (vérifier attachSupabaseAuth)
- `src/components/AppShell.tsx` (sidebar conditionnelle)
- `src/routes/_app/team.tsx` (nouveau)
- `src/routes/_app/products.tsx`, `sales.tsx`, `expenses.tsx`, `debts.tsx` (permissions UI)
- `src/routes/_app/dashboard.tsx` (filtre par agent optionnel)
