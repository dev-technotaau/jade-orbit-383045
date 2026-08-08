import type { Request, Response, NextFunction } from 'express';

// Registry of all available email templates with sample data generators
const TEMPLATE_REGISTRY: Record<
  string,
  {
    module: string;
    export: string;
    sampleArgs: () => unknown[];
    description: string;
  }
> = {
  // Auth templates
  'auth.welcome': {
    module: '../templates/email/auth',
    export: 'welcomeEmail',
    sampleArgs: () => ['John Doe'],
    description: 'Welcome email sent after registration',
  },
  'auth.verifyEmail': {
    module: '../templates/email/auth',
    export: 'verifyEmail',
    sampleArgs: () => ['482915'],
    description: 'Email verification OTP code',
  },
  'auth.passwordReset': {
    module: '../templates/email/auth',
    export: 'passwordReset',
    sampleArgs: () => ['https://hireadda.in/auth/reset-password?token=abc123def456'],
    description: 'Password reset link email',
  },
  'auth.loginAlert': {
    module: '../templates/email/auth',
    export: 'loginAlert',
    sampleArgs: () => [
      'February 16, 2026 at 10:30 AM IST',
      '203.0.113.42',
      'Chrome 120 on Windows 11',
    ],
    description: 'New login security alert',
  },
  'auth.accountDeactivated': {
    module: '../templates/email/auth',
    export: 'accountDeactivated',
    sampleArgs: () => ['John Doe'],
    description: 'Account deactivation notification',
  },
  'auth.accountSuspended': {
    module: '../templates/email/auth',
    export: 'accountSuspended',
    sampleArgs: () => ['John Doe', 'Violation of community guidelines'],
    description: 'Account suspension notification',
  },
  'auth.accountReactivated': {
    module: '../templates/email/auth',
    export: 'accountReactivated',
    sampleArgs: () => ['John Doe'],
    description: 'Account reactivation notification',
  },
  'auth.passwordResetOtp': {
    module: '../templates/email/auth',
    export: 'passwordResetOtp',
    sampleArgs: () => ['847293'],
    description: 'Password reset OTP code',
  },
  'auth.changePasswordOtp': {
    module: '../templates/email/auth',
    export: 'changePasswordOtp',
    sampleArgs: () => ['531076'],
    description: 'Change password confirmation OTP code',
  },

  // Job templates
  'job.applicationReceived': {
    module: '../templates/email/job',
    export: 'jobApplicationReceived',
    sampleArgs: () => ['Jane Smith', 'Senior React Developer', 'TechCorp Solutions'],
    description: 'Application received confirmation (to candidate)',
  },
  'job.newApplicationForEmployer': {
    module: '../templates/email/job',
    export: 'newApplicationForEmployer',
    sampleArgs: () => [
      'Mike Johnson',
      'Jane Smith',
      'Senior React Developer',
      'https://hireadda.in/employer/applications/abc123',
    ],
    description: 'New application notification (to employer)',
  },
  'job.interviewScheduled': {
    module: '../templates/email/job',
    export: 'interviewScheduled',
    sampleArgs: () => [
      'Jane Smith',
      'Senior React Developer',
      'March 5, 2026 at 2:00 PM IST',
      'https://meet.google.com/abc-defg-hij',
    ],
    description: 'Interview scheduling notification',
  },
  'job.offerReceived': {
    module: '../templates/email/job',
    export: 'jobOfferReceived',
    sampleArgs: () => [
      'Jane Smith',
      'Senior React Developer',
      'TechCorp Solutions',
      'https://hireadda.in/candidate/offers/abc123',
    ],
    description: 'Job offer notification',
  },
  'job.rejection': {
    module: '../templates/email/job',
    export: 'jobRejection',
    sampleArgs: () => ['Jane Smith', 'Senior React Developer', 'TechCorp Solutions'],
    description: 'Professional rejection email',
  },
  'job.statusUpdate': {
    module: '../templates/email/job',
    export: 'applicationStatusUpdate',
    sampleArgs: () => ['Jane Smith', 'Senior React Developer', 'TechCorp Solutions', 'Shortlisted'],
    description: 'Application status update notification',
  },
  'job.alert': {
    module: '../templates/email/job',
    export: 'jobAlert',
    sampleArgs: () => [
      'Jane Smith',
      [
        {
          title: 'Senior React Developer',
          company: 'TechCorp Solutions',
          location: 'Mumbai, India',
          link: 'https://hireadda.in/jobs/1',
        },
        {
          title: 'Full Stack Engineer',
          company: 'InnovateTech',
          location: 'Bangalore, India',
          link: 'https://hireadda.in/jobs/2',
        },
        {
          title: 'Frontend Architect',
          company: 'DigitalFirst',
          location: 'Remote',
          link: 'https://hireadda.in/jobs/3',
        },
      ],
    ],
    description: 'Job alert with matching recommendations',
  },

  // Onboarding templates
  'onboarding.profileReminder': {
    module: '../templates/email/onboarding',
    export: 'profileCompletionReminder',
    sampleArgs: () => ['John', 65],
    description: 'Profile completion reminder with progress bar',
  },
  'onboarding.documentApproved': {
    module: '../templates/email/onboarding',
    export: 'documentVerificationStatus',
    sampleArgs: () => ['Government ID (Aadhaar)', 'approved'],
    description: 'Document approved notification',
  },
  'onboarding.documentRejected': {
    module: '../templates/email/onboarding',
    export: 'documentVerificationStatus',
    sampleArgs: () => [
      'Government ID (Aadhaar)',
      'rejected',
      'The document image is blurry and the text is not legible.',
    ],
    description: 'Document rejected notification with reason',
  },
  'onboarding.employerWelcome': {
    module: '../templates/email/onboarding',
    export: 'onboardingWelcomeEmployer',
    sampleArgs: () => ['Mike Johnson', 'TechCorp Solutions'],
    description: 'Employer onboarding welcome email',
  },

  // Security templates
  'security.2faEnabled': {
    module: '../templates/email/security',
    export: 'twoFactorEnabled',
    sampleArgs: () => ['Authenticator App (TOTP)'],
    description: '2FA enabled confirmation',
  },
  'security.2faDisabled': {
    module: '../templates/email/security',
    export: 'twoFactorDisabled',
    sampleArgs: () => ['Authenticator App (TOTP)'],
    description: '2FA disabled warning',
  },
  'security.passwordChanged': {
    module: '../templates/email/security',
    export: 'passwordChanged',
    sampleArgs: () => ['February 16, 2026 at 3:45 PM IST'],
    description: 'Password change confirmation',
  },
  'security.emailChanged': {
    module: '../templates/email/security',
    export: 'emailChanged',
    sampleArgs: () => ['John Doe', 'john.new@example.com'],
    description: 'Email address change notification',
  },
  'security.accountLocked': {
    module: '../templates/email/security',
    export: 'accountLockedOut',
    sampleArgs: () => ['John Doe', 'February 16, 2026 at 4:15 PM IST'],
    description: 'Account locked after failed sign-in attempts',
  },
  'security.sessionsRevoked': {
    module: '../templates/email/security',
    export: 'sessionRevokedAll',
    sampleArgs: () => ['John Doe'],
    description: 'All sessions revoked notification',
  },

  // Onboarding — verification submitted
  'onboarding.verificationSubmitted': {
    module: '../templates/email/onboarding',
    export: 'verificationSubmitted',
    sampleArgs: () => ['Jane Smith', 'Government ID'],
    description: 'Verification request submitted notification',
  },

  // Job — application withdrawn
  'job.applicationWithdrawn': {
    module: '../templates/email/job',
    export: 'applicationWithdrawn',
    sampleArgs: () => ['Mike Johnson', 'Jane Smith', 'Senior React Developer'],
    description: 'Application withdrawn notification (to employer)',
  },

  // Ticket templates
  'ticket.confirmation': {
    module: '../templates/email/ticket',
    export: 'ticketConfirmation',
    sampleArgs: () => ['TKT-20260215-001', 'Cannot access my profile settings', 'candidate'],
    description: 'Ticket confirmation sent to user',
  },
  'ticket.newAdmin': {
    module: '../templates/email/ticket',
    export: 'ticketNewAdmin',
    sampleArgs: () => [
      'TKT-20260215-001',
      'Cannot access my profile settings',
      'Jane Smith',
      ' (Candidate)',
      'abc-123-def',
    ],
    description: 'New ticket notification to admin',
  },
  'ticket.replyAdmin': {
    module: '../templates/email/ticket',
    export: 'ticketReplyAdmin',
    sampleArgs: () => [
      'TKT-20260215-001',
      'Cannot access my profile settings',
      'Jane Smith',
      'I tried clearing my cache and it still does not work. Can you please look into this?',
      'abc-123-def',
    ],
    description: 'Ticket reply notification to admin',
  },
  'ticket.replyUser': {
    module: '../templates/email/ticket',
    export: 'ticketReplyUser',
    sampleArgs: () => [
      'TKT-20260215-001',
      'Cannot access my profile settings',
      'Thank you for reaching out. We have identified the issue and are working on a fix. Please try again in 30 minutes.',
      'candidate',
      'abc-123-def',
    ],
    description: 'Ticket reply notification to registered user',
  },
  'ticket.replyGuest': {
    module: '../templates/email/ticket',
    export: 'ticketReplyGuest',
    sampleArgs: () => [
      'TKT-20260215-001',
      'Question about job posting',
      'Thank you for your inquiry. The position is still open and accepting applications.',
    ],
    description: 'Ticket reply notification to guest user',
  },
  'ticket.statusChange': {
    module: '../templates/email/ticket',
    export: 'ticketStatusChange',
    sampleArgs: () => [
      'TKT-20260215-001',
      'Cannot access my profile settings',
      'resolved',
      'candidate',
      'abc-123-def',
      ' Please rate your experience.',
    ],
    description: 'Ticket status change notification',
  },
  'ticket.escalation': {
    module: '../templates/email/ticket',
    export: 'ticketEscalation',
    sampleArgs: () => ['TKT-20260215-001', 'Cannot access my profile settings', 'abc-123-def'],
    description: 'Ticket escalation — user rated Not Satisfied',
  },

  // Data export templates
  'export.userData': {
    module: '../templates/email/data-export',
    export: 'userDataExportReady',
    sampleArgs: () => ['February 16, 2026 at 3:00 PM IST'],
    description: 'User data (GDPR) export ready notification',
  },
  'export.candidates': {
    module: '../templates/email/data-export',
    export: 'candidateExportReady',
    sampleArgs: () => [
      'Mike',
      25,
      'xlsx',
      'https://example.com/download/candidates.xlsx',
      'candidates-1708100000.xlsx',
    ],
    description: 'Candidate export ready for download',
  },
  'export.resumes': {
    module: '../templates/email/data-export',
    export: 'resumeExportReady',
    sampleArgs: () => [
      'Mike',
      42,
      5,
      'https://example.com/download/resumes.zip',
      'resumes-1708100000.zip',
    ],
    description: 'Resume export (ZIP) ready for download',
  },

  // Weekly digest
  'digest.weekly': {
    module: '../templates/email/weekly-digest',
    export: 'weeklyHiringDigest',
    sampleArgs: () => [
      'Mike Johnson',
      'TechCorp Solutions',
      { newApplications: 12, activeJobs: 5, interviewsScheduled: 3, hires: 1 },
    ],
    description: 'Weekly hiring digest for employers',
  },

  // Contact form
  'contact.formSubmission': {
    module: '../templates/email/contact',
    export: 'contactFormSubmission',
    sampleArgs: () => [
      'Priya Sharma',
      'priya@example.com',
      'Inquiry about enterprise plan',
      'Hello, I am interested in your enterprise hiring plan. Could you share pricing details and schedule a demo?',
      'msg-abc-123',
    ],
    description: 'Contact form submission notification to support',
  },

  // ── Jobs & matching (event-driven) ──
  'job.postedConfirmation': {
    module: '../templates/email/job',
    export: 'jobPostedConfirmation',
    sampleArgs: () => ['Acme Corp', 'Senior React Developer', 'job-123'],
    description: 'Confirms to the employer that their job is live',
  },
  'job.closedNotification': {
    module: '../templates/email/job',
    export: 'jobClosedNotification',
    sampleArgs: () => ['Rahul Sharma', 'Senior React Developer', 'Acme Corp'],
    description: 'Tells applicants a job they applied to has closed',
  },
  'job.matchFound': {
    module: '../templates/email/job',
    export: 'jobMatchFound',
    sampleArgs: () => ['Rahul Sharma', 'Senior React Developer', 'Acme Corp', 'job-123', 0.92],
    description: 'Single job match (sent when exactly one new match)',
  },
  'job.matchDigest': {
    module: '../templates/email/job',
    export: 'jobMatchDigest',
    sampleArgs: () => [
      'Rahul Sharma',
      [
        {
          title: 'Senior React Developer',
          company: 'Acme Corp',
          location: 'Bengaluru',
          link: 'https://hireadda.in/candidate/jobs/job-1',
          score: 0.94,
        },
        {
          title: 'Frontend Lead',
          company: 'Globex',
          location: 'Remote',
          link: 'https://hireadda.in/candidate/jobs/job-2',
          score: 0.88,
        },
        {
          title: 'UI Engineer',
          company: 'Initech',
          location: 'Pune',
          link: 'https://hireadda.in/candidate/jobs/job-3',
          score: 0.81,
        },
      ],
      37,
    ],
    description: 'Batched job-match digest (2+ matches): top 5 + view all',
  },
  'job.matchingCandidatesFound': {
    module: '../templates/email/job',
    export: 'matchingCandidatesFound',
    sampleArgs: () => ['Acme Corp', 'Senior React Developer', 12, 'job-123'],
    description: 'Tells an employer their new job matched candidates',
  },

  // ── Recurring digests (marketing-class, opt-out per category) ──
  'digest.followedCompanyJobs': {
    module: '../templates/email/digests',
    export: 'followedCompanyJobs',
    sampleArgs: () => [
      'Rahul Sharma',
      [
        {
          title: 'Senior React Developer',
          company: 'Acme Corp',
          location: 'Bengaluru',
          jobId: 'job-1',
        },
        { title: 'Backend Engineer', company: 'Globex', location: 'Remote', jobId: 'job-2' },
      ],
      6,
    ],
    description: 'Weekly: new roles at companies the candidate follows',
  },
  'digest.profileViews': {
    module: '../templates/email/digests',
    export: 'profileViewsDigest',
    sampleArgs: () => ['Rahul Sharma', 14, ['Acme Corp', 'Globex', 'Initech'], 'this week'],
    description: 'Weekly: how many recruiters viewed the profile',
  },
  'digest.savedJobsClosing': {
    module: '../templates/email/digests',
    export: 'savedJobsClosing',
    sampleArgs: () => [
      'Rahul Sharma',
      [
        { title: 'Senior React Developer', company: 'Acme Corp', jobId: 'job-1', daysLeft: 0 },
        { title: 'Frontend Lead', company: 'Globex', jobId: 'job-2', daysLeft: 2 },
      ],
    ],
    description: 'Daily: saved jobs that stop accepting applications soon',
  },
  'digest.similarJobsApplied': {
    module: '../templates/email/digests',
    export: 'similarJobs',
    sampleArgs: () => [
      'Rahul Sharma',
      'Senior React Developer',
      [
        { title: 'Frontend Lead', company: 'Globex', location: 'Remote', jobId: 'job-2' },
        { title: 'UI Engineer', company: 'Initech', location: 'Pune', jobId: 'job-3' },
      ],
      'applied',
    ],
    description: 'Follow-up 24h after applying: more roles like that one',
  },
  'digest.similarJobsRejected': {
    module: '../templates/email/digests',
    export: 'similarJobs',
    sampleArgs: () => [
      'Rahul Sharma',
      'Senior React Developer',
      [
        { title: 'Frontend Lead', company: 'Globex', location: 'Remote', jobId: 'job-2' },
        { title: 'UI Engineer', company: 'Initech', location: 'Pune', jobId: 'job-3' },
      ],
      'rejected',
    ],
    description: 'Same list, softened copy — sent after a rejection',
  },
  'digest.candidateRecommendations': {
    module: '../templates/email/digests',
    export: 'candidateRecommendations',
    sampleArgs: () => [
      'Acme Corp',
      [
        {
          jobTitle: 'Senior React Developer',
          jobId: 'job-1',
          count: 8,
          topNames: ['Rahul Sharma', 'Priya Verma'],
        },
        { jobTitle: 'Backend Engineer', jobId: 'job-2', count: 3, topNames: ['Amit Kumar'] },
      ],
      11,
    ],
    description: 'Weekly (employer): new candidates matching open roles',
  },
  'digest.applicationsAwaiting': {
    module: '../templates/email/digests',
    export: 'applicationsAwaiting',
    sampleArgs: () => [
      'Acme Corp',
      [
        { jobTitle: 'Senior React Developer', jobId: 'job-1', count: 14, oldestDays: 6 },
        { jobTitle: 'Backend Engineer', jobId: 'job-2', count: 3, oldestDays: 2 },
      ],
      17,
    ],
    description: 'Daily (employer): applications sitting unreviewed',
  },
  'digest.cvSearchAlerts': {
    module: '../templates/email/digests',
    export: 'cvSearchAlerts',
    sampleArgs: () => [
      'Acme Corp',
      [
        { name: 'React devs, Bengaluru, 5+ yrs', count: 12 },
        { name: 'DevOps, Remote', count: 4 },
      ],
      16,
    ],
    description: 'Weekly (employer): new candidates in saved CV searches',
  },

  // ── Billing / payments ──
  'billing.orderConfirmation': {
    module: '../templates/email/billing',
    export: 'orderConfirmationEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Employer Premium',
        orderId: 'ord_ABC123',
        amountPaise: 499900,
        validityDays: 90,
        payUrl: 'https://hireadda.in/billing/pay/ord_ABC123',
      },
    ],
    description: 'Order created — complete your payment',
  },
  'billing.paymentCaptured': {
    module: '../templates/email/billing',
    export: 'paymentCapturedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Employer Premium',
        amountPaise: 499900,
        paymentId: 'pay_XYZ789',
        invoiceUrl: 'https://hireadda.in/billing/invoices/inv-1',
        validUntil: new Date('2026-08-05T10:30:00Z'),
      },
    ],
    description: 'Payment received — plan active',
  },
  'billing.paymentFailed': {
    module: '../templates/email/billing',
    export: 'paymentFailedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Employer Premium',
        amountPaise: 499900,
        reason: 'Card declined by issuing bank',
        retryUrl: 'https://hireadda.in/billing/pay/ord_ABC123',
      },
    ],
    description: 'Payment failed — retry link',
  },
  'billing.refundProcessed': {
    module: '../templates/email/billing',
    export: 'refundProcessedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        amountPaise: 499900,
        refundId: 'rfnd_abc123',
        paymentId: 'pay_XYZ789',
        expectedDate: '12 Aug 2026',
      },
    ],
    description: 'Refund processed confirmation',
  },
  'billing.refundRequestReceived': {
    module: '../templates/email/billing',
    export: 'refundRequestReceivedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Employer Premium',
        amountPaise: 499900,
        receiptNumber: 'RCP-2026-0042',
        orderUrl: 'https://hireadda.in/billing/orders/ord_ABC123',
      },
    ],
    description: 'Refund request acknowledged',
  },
  'billing.refundRequestRejected': {
    module: '../templates/email/billing',
    export: 'refundRequestRejectedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Employer Premium',
        amountPaise: 499900,
        receiptNumber: 'RCP-2026-0042',
        reviewNotes: 'Requested outside the 2-day refund window.',
        supportUrl: 'https://hireadda.in/support',
      },
    ],
    description: 'Refund request declined, with reason',
  },
  'billing.invoiceIssued': {
    module: '../templates/email/billing',
    export: 'invoiceIssuedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        invoiceNumber: 'INV-2026-0042',
        totalPaise: 499900,
        invoiceUrl: 'https://hireadda.in/billing/invoices/inv-1',
        issuedAt: new Date('2026-08-05T10:30:00Z'),
      },
    ],
    description: 'Invoice issued with PDF link',
  },
  'billing.subscriptionActivated': {
    module: '../templates/email/billing',
    export: 'subscriptionActivatedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Vendor Connect',
        amountPaise: 300000,
        cycle: 'monthly',
        nextChargeAt: new Date('2026-08-05T10:30:00Z'),
        manageUrl: 'https://hireadda.in/billing/subscriptions',
      },
    ],
    description: 'Subscription is now active',
  },
  'billing.subscriptionRenewed': {
    module: '../templates/email/billing',
    export: 'subscriptionRenewedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Vendor Connect',
        amountPaise: 300000,
        invoiceUrl: 'https://hireadda.in/billing/invoices/inv-2',
        nextChargeAt: new Date('2026-08-05T10:30:00Z'),
      },
    ],
    description: 'Subscription renewed for another cycle',
  },
  'billing.subscriptionCancelled': {
    module: '../templates/email/billing',
    export: 'subscriptionCancelledEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Vendor Connect',
        validUntil: new Date('2026-08-05T10:30:00Z'),
        reactivateUrl: 'https://hireadda.in/billing/subscriptions',
      },
    ],
    description: 'Subscription cancelled — access until date',
  },
  'billing.subscriptionGrace': {
    module: '../templates/email/billing',
    export: 'subscriptionGraceEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Vendor Connect',
        amountPaise: 300000,
        retryAt: new Date('2026-08-05T10:30:00Z'),
        graceUntil: new Date('2026-08-05T10:30:00Z'),
        updateMethodUrl: 'https://hireadda.in/billing/payment-methods',
      },
    ],
    description: 'Renewal failed — grace period, update payment method',
  },
  'billing.expiry1Day': {
    module: '../templates/email/billing',
    export: 'expiry1DayEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Employer Premium',
        expiresAt: new Date('2026-08-05T10:30:00Z'),
        renewUrl: 'https://hireadda.in/billing/renew',
      },
    ],
    description: 'Plan expires tomorrow reminder',
  },
  'billing.planUpgraded': {
    module: '../templates/email/billing',
    export: 'planUpgradedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        fromPlanName: 'Employer Standard',
        toPlanName: 'Employer Premium',
        amountPaise: 250000,
        prorationCreditPaise: 120000,
        validUntil: new Date('2026-08-05T10:30:00Z'),
        manageUrl: 'https://hireadda.in/billing/subscriptions',
      },
    ],
    description: 'Plan upgraded with pro-rata credit',
  },
  'billing.planDowngraded': {
    module: '../templates/email/billing',
    export: 'planDowngradedEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        fromPlanName: 'Employer Premium',
        toPlanName: 'Employer Standard',
        validUntil: new Date('2026-08-05T10:30:00Z'),
        manageUrl: 'https://hireadda.in/billing/subscriptions',
      },
    ],
    description: 'Scheduled downgrade took effect',
  },
  'billing.planExpired': {
    module: '../templates/email/billing',
    export: 'planExpiredEmail',
    sampleArgs: () => [
      {
        name: 'Acme Corp',
        planName: 'Employer Premium',
        renewUrl: 'https://hireadda.in/billing/renew',
      },
    ],
    description: 'Plan has expired — renew to restore access',
  },
  'billing.customPlanOffer': {
    module: '../templates/email/billing',
    export: 'customPlanOfferEmail',
    sampleArgs: () => [
      {
        name: 'Priya Verma',
        companyName: 'Acme Corp',
        totalPaise: 7500000,
        validityDays: 365,
        cvUnlocks: 5000,
        seats: 10,
        offerExpiresAt: new Date('2026-08-05T10:30:00Z'),
        acceptUrl: 'https://hireadda.in/billing/quotes/q_123',
      },
    ],
    description: 'Custom enterprise quote ready to accept',
  },
  'billing.fraudAlert': {
    module: '../templates/email/billing',
    export: 'fraudAlertEmail',
    sampleArgs: () => [
      {
        signal: 'Multiple cards, same device',
        severity: 'HIGH',
        userId: 'user-123',
        orderId: 'ord_ABC123',
        paymentId: 'pay_XYZ789',
        reviewUrl: 'https://hireadda.in/super-admin/billing/fraud',
      },
    ],
    description: 'Internal: fraud signal raised for review',
  },
  'billing.quoteReceived': {
    module: '../templates/email/billing',
    export: 'quoteReceivedEmail',
    sampleArgs: () => [
      {
        companyName: 'Acme Corp',
        contactPerson: 'Priya Verma',
        email: 'priya@acme.com',
        phone: '+919876543210',
        hiringNeed: '10 senior engineers in Q4',
        cvCount: 5000,
        reviewUrl: 'https://hireadda.in/super-admin/billing/quotes/q_123',
      },
    ],
    description: 'Internal: new enterprise quote request',
  },

  // ── Team / vendor / assisted hiring ──
  'team.invite': {
    module: '../templates/email/team',
    export: 'teamInviteEmail',
    sampleArgs: () => [
      {
        recipientName: 'Priya Verma',
        companyName: 'Acme Corp',
        inviterName: 'Rahul Sharma',
        role: 'RECRUITER',
        acceptUrl: 'https://hireadda.in/team/accept?token=abc',
        expiresInDays: 7,
      },
    ],
    description: 'Invite to join an employer team',
  },
  'team.ownershipTransferred': {
    module: '../templates/email/team',
    export: 'teamOwnershipTransferredEmail',
    sampleArgs: () => [
      {
        recipientName: 'Priya Verma',
        companyName: 'Acme Corp',
        previousOwnerName: 'Rahul Sharma',
        dashboardUrl: 'https://hireadda.in/employer/team',
      },
    ],
    description: 'Team ownership handed over',
  },
  'vendor.newLead': {
    module: '../templates/email/vendor',
    export: 'vendorNewLeadEmail',
    sampleArgs: () => [
      {
        recipientName: 'Priya Verma',
        employerName: 'Acme Corp',
        jobTitle: 'Senior React Developer',
        requirementPreview: 'Looking for 3 senior React engineers, Bengaluru, immediate joiners.',
        inboxUrl: 'https://hireadda.in/employer/vendor/leads',
      },
    ],
    description: 'Vendor received a new hiring lead',
  },
  'assistedHiring.delivered': {
    module: '../templates/email/assisted-hiring',
    export: 'assistedHiringDeliveryEmail',
    sampleArgs: () => [
      {
        recipientName: 'Acme Corp',
        roleTitle: 'Senior React Developer',
        profiles: [
          {
            name: 'Rahul Sharma',
            headline: '6 yrs · React, Node',
            experienceYears: 6,
            location: 'Bengaluru',
            resumeUrl: 'https://hireadda.in/r/1',
          },
        ],
        customMessage: 'Shortlisted against your brief.',
      },
    ],
    description: 'Assisted-hiring shortlist delivered to the employer',
  },

  // ── Security & account ──
  'security.mfaRecoveryOtp': {
    module: '../templates/email/security',
    export: 'mfaRecoveryOtp',
    sampleArgs: () => ['483920'],
    description: 'MFA recovery one-time code',
  },
  'auth.accountDeletionRequested': {
    module: '../templates/email/auth',
    export: 'accountDeletionRequested',
    sampleArgs: () => ['Rahul Sharma'],
    description: 'Account deletion requested confirmation',
  },
  'security.newDeviceLogin': {
    module: '../templates/email/new-device-login',
    export: 'newDeviceLoginEmail',
    sampleArgs: () => [
      'Rahul Sharma',
      'Chrome 126 on Windows 11',
      'Bengaluru, India',
      '05 Aug 2026, 10:30 AM IST',
    ],
    description: 'Sign-in from a new device',
  },
  'verification.employmentRequest': {
    module: '../templates/email/employment-verification',
    export: 'employmentVerificationRequest',
    sampleArgs: () => [
      'Priya Verma',
      'Rahul Sharma',
      'Acme Corp',
      'Senior React Developer',
      'Jan 2022 – Mar 2026',
      'https://hireadda.in/verify/emp/confirm?token=abc',
      'https://hireadda.in/verify/emp/deny?token=abc',
    ],
    description: 'Asks a former employer to confirm employment',
  },
};

/**
 * GET /api/v1/admin/email-templates
 */
export const listTemplates = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const templates = Object.entries(TEMPLATE_REGISTRY).map(([key, config]) => ({
      key,
      description: config.description,
    }));
    res.status(200).json({ status: 'success', data: templates });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/admin/email-templates/preview
 */
export const previewTemplate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { templateName } = req.body;
    const config = TEMPLATE_REGISTRY[templateName];

    if (!config) {
      res.status(404).json({
        status: 'error',
        message: `Template '${templateName}' not found`,
      });
      return;
    }

    const mod = await import(config.module);
    const templateFn = mod[config.export];

    if (!templateFn || typeof templateFn !== 'function') {
      res.status(404).json({
        status: 'error',
        message: `Template function '${config.export}' not found in module`,
      });
      return;
    }

    const args = config.sampleArgs();
    const result = templateFn(...args);

    res.status(200).json({
      status: 'success',
      data: {
        subject: result.subject,
        html: result.html,
        text: result.text,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/admin/email-templates/test
 */
export const sendTestEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { templateName, toEmail } = req.body;
    const config = TEMPLATE_REGISTRY[templateName];

    if (!config) {
      res.status(404).json({
        status: 'error',
        message: `Template '${templateName}' not found`,
      });
      return;
    }

    const mod = await import(config.module);
    const templateFn = mod[config.export];
    const args = config.sampleArgs();
    const result = templateFn(...args);

    const { emailQueue } = await import('../jobs/email.queue');
    await emailQueue.add('send-test-email', {
      to: toEmail,
      subject: `[TEST] ${result.subject}`,
      html: result.html,
      text: result.text,
    });

    res.status(200).json({
      status: 'success',
      message: `Test email queued for ${toEmail}`,
    });
  } catch (error) {
    next(error);
  }
};
