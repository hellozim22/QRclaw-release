import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPageLayout, { legalTextStyles } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Terms of Service — QRClaw',
  description: 'QRClaw Terms of Service',
};

export default function TermsPage() {
  return (
    <LegalPageLayout
      active="terms"
      title="Terms of Service"
      description="These terms explain how QRClaw works, what each side is responsible for, and the boundaries that apply when you use the product."
      updatedAt="March 25, 2026"
    >
      <h2 style={legalTextStyles.h2}>1. About these terms</h2>
      <p style={legalTextStyles.p}>
        These Terms of Service explain the rules for using QRClaw, including our website, dashboard,
        QR tools, visitor chat experiences, and related services (together, the
        &quot;Service&quot;).
      </p>
      <p style={legalTextStyles.p}>
        In these Terms, &quot;QRClaw,&quot; &quot;we,&quot; &quot;us,&quot; and &quot;our&quot; mean
        the team operating QRClaw. By accessing or using the Service, you agree to these Terms. If
        you do not agree, please do not use QRClaw.
      </p>

      <h2 style={legalTextStyles.h2}>2. Who can use QRClaw</h2>
      <p style={legalTextStyles.p}>
        You may use the Service only if you can legally enter into a binding agreement under the
        laws that apply to you. If you use QRClaw on behalf of a company, organization, or other
        entity, you confirm that you have authority to bind that entity to these Terms.
      </p>

      <h2 style={legalTextStyles.h2}>3. What QRClaw is</h2>
      <p style={legalTextStyles.p}>
        QRClaw provides infrastructure for connecting AI agents to QR codes, managing chat flows,
        and enabling visitors to interact with those agents. QRClaw is a platform layer. By default,
        we do not supply the intelligence, answers, or decision-making of third-party AI models
        connected by an Agent Owner.
      </p>

      <h2 style={legalTextStyles.h2}>4. Your account</h2>
      <p style={legalTextStyles.p}>
        Some features require an account. You are responsible for keeping your login credentials
        secure and for activity that happens under your account. Please provide accurate
        information, keep it up to date, and let us know promptly if you believe your account has
        been compromised.
      </p>

      <h2 style={legalTextStyles.h2}>5. If you run an agent on QRClaw</h2>
      <p style={legalTextStyles.p}>
        If you create, connect, publish, or manage an agent through QRClaw, you are responsible for
        that agent and how it is used. That includes:
      </p>
      <ul style={legalTextStyles.ul}>
        <li>
          The legality, safety, and accuracy of the agent&apos;s content, prompts, instructions, and
          outputs.
        </li>
        <li>Any claims, offers, guidance, or representations made by the agent.</li>
        <li>Getting any rights, permissions, notices, or consents your use case requires.</li>
        <li>
          Providing any visitor or customer privacy notices and obtaining any required consent for
          your data practices or downstream AI integrations.
        </li>
        <li>
          Following the laws, regulations, and industry rules that apply to your business,
          customers, and content.
        </li>
        <li>
          Making sure your connected tools, APIs, and AI providers are properly configured and
          authorized.
        </li>
      </ul>

      <h2 style={legalTextStyles.h2}>6. If you use a QR chat as a visitor</h2>
      <p style={legalTextStyles.p}>
        Visitors may be able to start a chat by scanning a QR code without creating an account.
        Visitors must still use the Service lawfully and may not interfere with, overload, probe, or
        misuse the Service, connected agents, or other users.
      </p>

      <h2 style={legalTextStyles.h2}>7. Things you may not do</h2>
      <p style={legalTextStyles.p}>You may not, and may not help others to:</p>
      <ul style={legalTextStyles.ul}>
        <li>
          Use QRClaw for unlawful, fraudulent, harmful, abusive, defamatory, or deceptive activity.
        </li>
        <li>
          Infringe or misuse someone else&apos;s intellectual property, privacy, publicity, or other
          rights.
        </li>
        <li>
          Send malware, spam, scraping traffic, credential attacks, or other disruptive code or
          activity.
        </li>
        <li>Bypass rate limits, access controls, or technical restrictions.</li>
        <li>
          Reverse engineer, decompile, or try to extract source code except where the law does not
          allow us to restrict that right.
        </li>
        <li>Use the Service in a way that could damage QRClaw, our users, or the public.</li>
      </ul>

      <h2 style={legalTextStyles.h2}>8. Third-party AI and integrations</h2>
      <p style={legalTextStyles.p}>
        QRClaw may work with third-party AI systems, APIs, software, and tools. Those services are
        not controlled by QRClaw, and we are not responsible for their availability, security,
        legality, outputs, or business practices. Your use of those services is governed by their
        own terms and policies.
      </p>

      <h2 style={legalTextStyles.h2}>9. Data and privacy</h2>
      <p style={legalTextStyles.p}>
        Your use of QRClaw is also governed by our{' '}
        <Link href="/privacy" style={{ color: 'var(--color-red)', textDecoration: 'none' }}>
          Privacy Policy
        </Link>
        . By using the Service, you understand that QRClaw may process account data, technical data,
        and conversation-related data as described there.
      </p>
      <p style={legalTextStyles.p}>
        By default, QRClaw is designed to transmit and store messages for core service
        functionality, synchronization, and reliability. If you enable optional analytics or
        reporting features that rely on message-level processing, you authorize QRClaw to process
        the relevant data within the scope of that feature and your chosen settings.
      </p>

      <h2 style={legalTextStyles.h2}>10. Ownership and licenses</h2>
      <p style={legalTextStyles.p}>
        QRClaw owns the Service itself, including its software, interface, design, documentation,
        branding, and related intellectual property. Subject to these Terms, we give you a limited,
        non-exclusive, non-transferable, revocable right to use the Service for its intended
        purpose.
      </p>
      <p style={legalTextStyles.p}>
        You keep ownership of the content, data, prompts, and materials you submit or connect to the
        Service. To run QRClaw, you give us a limited, non-exclusive, worldwide, royalty-free
        license to host, store, transmit, reproduce, format, and otherwise process that content only
        as needed to operate, secure, improve, and support the Service, including through service
        providers working on our behalf.
      </p>

      <h2 style={legalTextStyles.h2}>11. Feedback</h2>
      <p style={legalTextStyles.p}>
        If you send us ideas, suggestions, or feedback about QRClaw, you give us permission to use,
        modify, and incorporate that feedback without restriction and without compensation, unless
        applicable law says otherwise.
      </p>

      <h2 style={legalTextStyles.h2}>12. Free today, paid features later</h2>
      <p style={legalTextStyles.p}>
        QRClaw is currently free to use unless we clearly say otherwise. In the future, we may
        introduce paid plans, premium features, usage limits, or other commercial terms. If we do,
        we may publish additional pricing or plan terms that apply to those offerings.
      </p>

      <h2 style={legalTextStyles.h2}>13. Suspension and termination</h2>
      <p style={legalTextStyles.p}>
        We may suspend, restrict, or terminate access to all or part of the Service if we reasonably
        believe it is necessary to:
      </p>
      <ul style={legalTextStyles.ul}>
        <li>Protect QRClaw, our users, or the public.</li>
        <li>Investigate suspected abuse, fraud, or security incidents.</li>
        <li>Address violations of these Terms or applicable law.</li>
        <li>Comply with a legal obligation or a lawful request.</li>
      </ul>
      <p style={legalTextStyles.p}>
        You may stop using QRClaw at any time. Provisions that should reasonably continue after
        termination will continue, including provisions about ownership, disclaimers, liability
        limits, and indemnification.
      </p>

      <h2 style={legalTextStyles.h2}>14. Disclaimers</h2>
      <p style={legalTextStyles.p}>
        QRClaw is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the
        maximum extent permitted by law, we disclaim all warranties, whether express, implied, or
        statutory, including implied warranties of merchantability, fitness for a particular
        purpose, non-infringement, availability, and freedom from errors or harmful components.
      </p>
      <p style={legalTextStyles.p}>
        We do not promise that the Service will always be uninterrupted, secure, or error-free, or
        that any third-party AI output will be accurate, lawful, complete, or suitable for your use
        case.
      </p>

      <h2 style={legalTextStyles.h2}>15. Liability limits</h2>
      <p style={legalTextStyles.p}>
        To the maximum extent permitted by law, QRClaw and its operators, contributors, and service
        providers will not be liable for indirect, incidental, special, consequential, exemplary, or
        punitive damages, or for any loss of profits, revenue, business, goodwill, data, or other
        intangible losses arising out of or related to the Service or these Terms, even if we were
        advised such damages were possible.
      </p>
      <p style={legalTextStyles.p}>
        To the maximum extent permitted by law, QRClaw&apos;s total aggregate liability for claims
        relating to the Service or these Terms will not exceed the greater of: (a) the amount you
        paid QRClaw for the Service in the twelve months before the event giving rise to the claim,
        or (b) USD 100.
      </p>

      <h2 style={legalTextStyles.h2}>16. Indemnity</h2>
      <p style={legalTextStyles.p}>
        To the maximum extent permitted by law, you will defend, indemnify, and hold harmless QRClaw
        and the team operating QRClaw from claims, liabilities, damages, judgments, losses, costs,
        and expenses (including reasonable legal fees) arising out of or related to:
      </p>
      <ul style={legalTextStyles.ul}>
        <li>Your use of the Service.</li>
        <li>Your agents, prompts, content, integrations, or business activities.</li>
        <li>Your violation of these Terms or applicable law.</li>
        <li>Your infringement or misappropriation of someone else&apos;s rights.</li>
      </ul>

      <h2 style={legalTextStyles.h2}>17. Changes to the Service or these Terms</h2>
      <p style={legalTextStyles.p}>
        We may change, suspend, or discontinue parts of QRClaw at any time. We may also update these
        Terms from time to time. If we make a material change, we may notify you in the Service, by
        email, or by another reasonable method. If you continue using the Service after the updated
        Terms take effect, the updated Terms will apply.
      </p>

      <h2 style={legalTextStyles.h2}>18. General</h2>
      <p style={legalTextStyles.p}>
        These Terms are the complete agreement between you and QRClaw about the Service, except for
        any additional terms that clearly apply to a specific feature or offering. If one part of
        these Terms is found unenforceable, the rest will remain in effect to the fullest extent
        permitted by law. If we do not enforce a provision, that does not mean we waive it.
      </p>

      <h2 style={legalTextStyles.h2}>19. Contact</h2>
      <p style={legalTextStyles.p}>
        If you have questions about these Terms, contact us at{' '}
        <a
          href="mailto:hello@qrclaw.ai"
          style={{ color: 'var(--color-red)', textDecoration: 'none' }}
        >
          hello@qrclaw.ai
        </a>
        . This is QRClaw&apos;s official public contact email.
      </p>
    </LegalPageLayout>
  );
}
