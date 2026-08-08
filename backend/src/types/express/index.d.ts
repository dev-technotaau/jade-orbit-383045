declare global {
  namespace Express {
    /**
     * The synthetic operator set by `requireAppPassword`.
     *
     * This is NOT a database record — the User model and every auth concept
     * (roles, sessions, permissions) were removed when this became a
     * single-password module. It exists so the WhatsApp controllers can keep
     * stamping `createdBy` / `actorUserId` / `performedBy` unchanged; those
     * columns are plain nullable strings with no foreign key.
     */
    interface User {
      id: string;
      role: 'ADMIN';
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
