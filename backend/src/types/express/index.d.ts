import type { Role } from '@prisma/client';
import type { EffectivePermissions } from '../../services/permission.service';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: Role;
      firstName?: string | null;
      lastName?: string | null;
      isEmailVerified?: boolean;
      mfaEnabled?: boolean;
      sessionId?: string;
    }

    interface Request {
      user?: User;
      /**
       * Registry key enforced by `requirePermission` on this route, stamped
       * so the activity middleware can attribute the call to a domain
       * without re-deriving it from the URL.
       */
      permissionKey?: string;
      /**
       * The admin's resolved grant list, memoised for the duration of the
       * request by `requirePermission`. Lets a handler run a second,
       * finer-grained check (e.g. per-field) without another Redis/DB hit.
       */
      adminPermissions?: EffectivePermissions;
    }
  }
}
