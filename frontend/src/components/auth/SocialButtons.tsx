'use client';

import Button from '@/components/ui/Button';
import { authService } from '@/services/auth.service';

interface SocialButtonsProps {
  mode: 'login' | 'register';
  role?: 'CANDIDATE' | 'EMPLOYER';
}

export default function SocialButtons({ mode, role }: SocialButtonsProps) {
  // OAuth social login is temporarily disabled
  // Uncomment when Google & LinkedIn OAuth are configured in production

  // const handleGoogle = () => {
  //     window.location.href = authService.getGoogleAuthUrl(role);
  // };

  // const handleLinkedIn = () => {
  //     window.location.href = authService.getLinkedInAuthUrl();
  // };

  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-[var(--text-muted)]">Social login coming soon</p>
      {/* Google OAuth - Temporarily disabled
            <Button variant="outline" fullWidth onClick={handleGoogle}
                leftIcon={<svg className="h-5 w-5" viewBox="0 0 24 24">...</svg>}>
                {mode === 'login' ? 'Continue with Google' : 'Sign up with Google'}
            </Button>
            */}
      {/* LinkedIn OAuth - Temporarily disabled
            <Button variant="outline" fullWidth onClick={handleLinkedIn}
                leftIcon={<svg className="h-5 w-5" fill="#0A66C2" viewBox="0 0 24 24">...</svg>}>
                {mode === 'login' ? 'Continue with LinkedIn' : 'Sign up with LinkedIn'}
            </Button>
            */}
    </div>
  );
}
