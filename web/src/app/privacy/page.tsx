import type { Metadata } from 'next';
import LegalPageLayout, { legalTextStyles } from '@/components/legal/LegalPageLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy — QRClaw',
  description: 'QRClaw Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      active="privacy"
      title="Privacy Policy"
      description="This policy explains what information QRClaw handles, why we handle it, and where the privacy boundaries are across accounts, visitors, and optional analytics features."
      updatedAt="March 25, 2026"
    >
      <h2 style={legalTextStyles.h2}>1. About this policy</h2>
      <p style={legalTextStyles.p}>
        This Privacy Policy explains what information QRClaw collects, how we use it, and the
        choices you have. In this policy, &quot;QRClaw,&quot; &quot;we,&quot; &quot;us,&quot; and
        &quot;our&quot; mean the team operating QRClaw.
      </p>
      <p style={legalTextStyles.p}>
        This policy applies when you use our website, dashboard, QR tools, visitor chat flows, and
        related services. It covers account holders, people evaluating the product, visitors who
        scan QR codes, and others who interact with the Service. It does not cover third-party AI
        systems, websites, or services that an Agent Owner chooses to connect to QRClaw.
      </p>
      <p style={legalTextStyles.p}>
        QRClaw may play different privacy roles in different parts of the product. For account,
        security, and site-operation data, QRClaw generally acts as the controller. For certain
        visitor-facing chat data handled on behalf of an Agent Owner, QRClaw may act as a service
        provider or processor on behalf of that Agent Owner. Agent Owners remain responsible for the
        notices, disclosures, and consents their own use cases require.
      </p>

      <h2 style={legalTextStyles.h2}>2. Information we collect</h2>

      <h3 style={legalTextStyles.h3}>2.1 Account information</h3>
      <p style={legalTextStyles.p}>If you create or maintain an account, we may collect:</p>
      <ul style={legalTextStyles.ul}>
        <li>Your email address and login credentials.</li>
        <li>Account creation details, login history, and security events.</li>
        <li>Messages you send us for support or operations.</li>
      </ul>

      <h3 style={legalTextStyles.h3}>2.2 Agent and workspace information</h3>
      <p style={legalTextStyles.p}>
        If you connect an agent to QRClaw, we may collect or generate:
      </p>
      <ul style={legalTextStyles.ul}>
        <li>Agent name, description, avatar, and configuration details.</li>
        <li>
          Connection status, technical logs, integration health, and hashed credentials where
          applicable.
        </li>
        <li>QR code records, labels, destinations, scan counts, and timestamps.</li>
      </ul>

      <h3 style={legalTextStyles.h3}>2.3 Visitor and device information</h3>
      <p style={legalTextStyles.p}>
        When someone scans a QR code or visits our website, we may collect technical information
        such as IP address, browser type, device and operating system details, approximate region,
        timestamps, referral information, and interaction logs. Visitors do not need to create an
        account to start a chat, but some technical data is still needed to route requests, keep the
        Service reliable, and prevent abuse.
      </p>

      <h3 style={legalTextStyles.h3}>2.4 Messages and analytics features</h3>
      <p style={legalTextStyles.p}>
        Messages between Visitors and Agents may pass through QRClaw and may be stored in encrypted
        form. By default, QRClaw is built to function as a relay and infrastructure layer for
        message delivery, storage, synchronization, and reliability.
      </p>
      <p style={legalTextStyles.p}>
        We do not use message content for analytics unless the relevant account holder explicitly
        enables a feature that requires it, such as service reports, business insights, or
        performance summaries. If those features are enabled, we process the relevant data only for
        that feature and only within the scope the user has chosen to authorize.
      </p>

      <h3 style={legalTextStyles.h3}>2.5 Cookies and similar technologies</h3>
      <p style={legalTextStyles.p}>
        We may use cookies, local storage, and similar technologies for authentication, session
        continuity, language preferences, security, and core product functionality. If we later
        introduce non-essential cookies or similar tools, we may provide additional notice or
        consent options where required by law.
      </p>

      <h2 style={legalTextStyles.h2}>3. How we use information</h2>
      <p style={legalTextStyles.p}>We use information to run and improve QRClaw, including to:</p>
      <ul style={legalTextStyles.ul}>
        <li>Provide, maintain, and improve the Service.</li>
        <li>Authenticate users and secure accounts, sessions, and integrations.</li>
        <li>Create and manage QR codes, chats, dashboards, and related records.</li>
        <li>Detect fraud, abuse, spam, and unauthorized access.</li>
        <li>Monitor performance, troubleshoot issues, and support reliability.</li>
        <li>Communicate about updates, support requests, and operational notices.</li>
        <li>Provide optional analytics or reporting features that users choose to enable.</li>
        <li>Comply with legal obligations and protect our users, rights, and the public.</li>
      </ul>

      <h2 style={legalTextStyles.h2}>4. Legal bases where required</h2>
      <p style={legalTextStyles.p}>
        Where applicable law requires a legal basis for processing, we generally rely on one or more
        of these: performing our contract with you, our legitimate interests in operating and
        securing QRClaw, your consent, and compliance with legal obligations. The exact basis
        depends on the type of information and how the Service is being used.
      </p>

      <h2 style={legalTextStyles.h2}>5. Things we do not do</h2>
      <ul style={legalTextStyles.ul}>
        <li>We do not sell personal information to data brokers.</li>
        <li>
          We do not share personal information with third parties for their own direct marketing.
        </li>
        <li>We do not use message content to train general-purpose AI models for others.</li>
        <li>
          We do not review or analyze message content for analytics unless the relevant user has
          chosen to enable that processing.
        </li>
        <li>We do not operate or control third-party AI systems connected by Agent Owners.</li>
      </ul>

      <h2 style={legalTextStyles.h2}>6. When we share information</h2>
      <p style={legalTextStyles.p}>We may share information in a limited set of cases:</p>
      <ul style={legalTextStyles.ul}>
        <li>With service providers that help us host, secure, deliver, or support QRClaw.</li>
        <li>
          With legal, accounting, audit, insurance, or other professional advisers where reasonably
          necessary.
        </li>
        <li>When required by law, regulation, court order, or a lawful government request.</li>
        <li>
          To investigate or respond to fraud, abuse, security incidents, or violations of our terms.
        </li>
        <li>
          As part of a merger, financing, acquisition, restructuring, or sale of all or part of our
          business, subject to appropriate safeguards.
        </li>
      </ul>

      <h2 style={legalTextStyles.h2}>7. International transfers</h2>
      <p style={legalTextStyles.p}>
        Your information may be processed in countries other than where you live. When that happens,
        we take reasonable steps to apply appropriate safeguards, which may include contractual
        protections, access controls, and technical security measures.
      </p>

      <h2 style={legalTextStyles.h2}>8. How long we keep information</h2>
      <p style={legalTextStyles.p}>
        We keep information for as long as reasonably necessary to provide the Service, keep it
        secure, comply with legal obligations, resolve disputes, and enforce our agreements.
        Different types of data may be kept for different periods.
      </p>
      <ul style={legalTextStyles.ul}>
        <li>
          Account records are usually kept while your account is active and for a reasonable period
          afterward.
        </li>
        <li>
          Technical and security logs may be kept as needed for diagnostics, fraud prevention, and
          compliance.
        </li>
        <li>
          Conversation data may be kept according to the settings, retention features, or plan
          options available in the Service.
        </li>
        <li>
          If you ask us to delete data, we will take reasonable steps to delete or de-identify it,
          subject to backup cycles, legal obligations, and legitimate business needs.
        </li>
      </ul>

      <h2 style={legalTextStyles.h2}>9. Security</h2>
      <p style={legalTextStyles.p}>
        We use administrative, technical, and organizational safeguards designed to protect
        information from unauthorized access, loss, misuse, disclosure, or alteration. These
        safeguards may include encryption, access controls, credential protections, logging, rate
        limiting, and security monitoring. No system is perfectly secure, and we cannot guarantee
        absolute security.
      </p>

      <h2 style={legalTextStyles.h2}>10. Your rights and choices</h2>
      <p style={legalTextStyles.p}>
        Depending on where you live, you may have rights to access, correct, delete, export,
        restrict, object to, or withdraw consent for certain processing of your information. You may
        also be able to manage some privacy choices directly in the product, including turning
        optional analytics features on or off where available.
      </p>
      <p style={legalTextStyles.p}>
        We may ask you to verify your identity before acting on a request, and some requests may be
        limited where the law allows an exception.
      </p>

      <h2 style={legalTextStyles.h2}>11. Children&apos;s privacy</h2>
      <p style={legalTextStyles.p}>
        QRClaw is not directed to children, and we do not knowingly collect personal information
        from children in violation of applicable law. If you believe a child has provided
        information through the Service, please contact us so we can review the situation and take
        appropriate steps.
      </p>

      <h2 style={legalTextStyles.h2}>12. Changes to this policy</h2>
      <p style={legalTextStyles.p}>
        We may update this Privacy Policy from time to time to reflect changes in the product, our
        practices, legal requirements, or operational needs. If we make a material change, we may
        provide notice in the Service, by email, or by another reasonable method. Continued use of
        the Service after an update means the revised Policy will apply going forward.
      </p>

      <h2 style={legalTextStyles.h2}>13. Contact</h2>
      <p style={legalTextStyles.p}>
        If you have privacy questions, concerns, or requests, contact us at{' '}
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
