/**
 * Alabobai Legal Department Templates
 * Ready-to-use legal document generators
 */

export const LEGAL_TEMPLATES = {
  // ============================================================================
  // LLC OPERATING AGREEMENT
  // ============================================================================
  llcOperatingAgreement: {
    name: 'LLC Operating Agreement',
    description: 'Single-member or multi-member LLC operating agreement',
    fields: ['companyName', 'state', 'members', 'managementType', 'capitalContributions'],
    generate: (data: {
      companyName: string;
      state: string;
      members: Array<{ name: string; ownership: number; contribution: number }>;
      managementType: 'member-managed' | 'manager-managed';
      effectiveDate: string;
    }) => `
LIMITED LIABILITY COMPANY OPERATING AGREEMENT
OF
${data.companyName.toUpperCase()}

A ${data.state} Limited Liability Company

OPERATING AGREEMENT

This Operating Agreement ("Agreement") is entered into as of ${data.effectiveDate}, by and among the Members identified below.

ARTICLE I - ORGANIZATION

1.1 Formation. The Company was formed as a ${data.state} Limited Liability Company on the date the Articles of Organization were filed with the ${data.state} Secretary of State.

1.2 Name. The name of the Company is ${data.companyName}.

1.3 Principal Office. The principal office of the Company shall be located at such place as the Members may designate from time to time.

1.4 Registered Agent. The Company shall maintain a registered agent in the State of ${data.state} as required by law.

1.5 Term. The Company shall continue in existence until dissolved in accordance with this Agreement or by law.

ARTICLE II - PURPOSE

2.1 Purpose. The Company is formed for the purpose of engaging in any lawful business activity for which a limited liability company may be organized under the laws of ${data.state}.

ARTICLE III - MEMBERS AND CAPITAL

3.1 Members. The Members of the Company and their respective ownership interests are:

${data.members.map(m => `   ${m.name}: ${m.ownership}% ownership interest
   Initial Capital Contribution: $${m.contribution.toLocaleString()}`).join('\n\n')}

3.2 Capital Contributions. The Members have contributed or agreed to contribute the amounts set forth above.

3.3 Additional Contributions. No Member shall be required to make additional capital contributions.

ARTICLE IV - MANAGEMENT

4.1 Management. The Company shall be ${data.managementType}.

${data.managementType === 'member-managed'
  ? `4.2 Member Authority. Each Member shall have the authority to bind the Company in the ordinary course of business. Major decisions requiring unanimous consent include:
   (a) Sale of substantially all Company assets
   (b) Merger or dissolution of the Company
   (c) Amendment of this Agreement
   (d) Admission of new Members
   (e) Any transaction exceeding $10,000`
  : `4.2 Manager Authority. The Manager(s) shall have full authority to manage the business and affairs of the Company. The initial Manager(s) shall be designated by the Members.`}

ARTICLE V - ALLOCATIONS AND DISTRIBUTIONS

5.1 Profits and Losses. Profits and losses shall be allocated to Members in proportion to their ownership interests.

5.2 Distributions. Distributions shall be made at such times and in such amounts as determined by the Members, in proportion to their ownership interests.

5.3 Tax Distributions. The Company shall distribute to each Member, at least quarterly, an amount sufficient to cover such Member's estimated tax liability attributable to Company income.

ARTICLE VI - TRANSFER OF INTERESTS

6.1 Restrictions on Transfer. No Member may transfer all or any portion of their interest without the prior written consent of all other Members.

6.2 Right of First Refusal. Before any transfer, the selling Member must first offer to sell to the other Members on the same terms.

ARTICLE VII - DISSOLUTION

7.1 Events of Dissolution. The Company shall be dissolved upon:
   (a) The unanimous written consent of all Members
   (b) The sale of all Company assets
   (c) Any event that makes it unlawful for the Company to continue
   (d) Entry of a judicial decree of dissolution

7.2 Winding Up. Upon dissolution, the Company's assets shall be distributed:
   (a) First, to creditors
   (b) Second, to Members in proportion to their capital account balances

ARTICLE VIII - MISCELLANEOUS

8.1 Amendments. This Agreement may only be amended by the unanimous written consent of all Members.

8.2 Governing Law. This Agreement shall be governed by the laws of ${data.state}.

8.3 Severability. If any provision is held invalid, the remaining provisions shall continue in effect.

8.4 Entire Agreement. This Agreement constitutes the entire agreement among the Members.

IN WITNESS WHEREOF, the undersigned have executed this Agreement as of the date first written above.

MEMBERS:

${data.members.map(m => `_________________________________
${m.name}
Date: _______________`).join('\n\n')}
`
  },

  // ============================================================================
  // NON-DISCLOSURE AGREEMENT (NDA)
  // ============================================================================
  nda: {
    name: 'Non-Disclosure Agreement',
    description: 'Mutual or one-way NDA for protecting confidential information',
    fields: ['partyA', 'partyB', 'mutual', 'purpose', 'duration'],
    generate: (data: {
      partyA: { name: string; address: string };
      partyB: { name: string; address: string };
      mutual: boolean;
      purpose: string;
      durationYears: number;
      effectiveDate: string;
    }) => `
${data.mutual ? 'MUTUAL ' : ''}NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of ${data.effectiveDate} ("Effective Date")

BETWEEN:

${data.partyA.name} ("${data.mutual ? 'Party A' : 'Disclosing Party'}")
Address: ${data.partyA.address}

AND:

${data.partyB.name} ("${data.mutual ? 'Party B' : 'Receiving Party'}")
Address: ${data.partyB.address}

${data.mutual ? '(each a "Party" and collectively the "Parties")' : ''}

RECITALS:

WHEREAS, ${data.mutual
  ? 'the Parties wish to explore a potential business relationship'
  : `${data.partyA.name} possesses certain confidential information`} related to ${data.purpose};

WHEREAS, ${data.mutual
  ? 'each Party may disclose confidential information to the other'
  : `${data.partyA.name} wishes to disclose certain information to ${data.partyB.name}`};

NOW, THEREFORE, in consideration of the mutual covenants contained herein, the Parties agree:

1. DEFINITION OF CONFIDENTIAL INFORMATION

"Confidential Information" means any and all non-public information, including but not limited to:
   (a) Trade secrets, inventions, ideas, processes, formulas, source code, data
   (b) Business plans, strategies, customer lists, pricing information
   (c) Financial information, projections, and records
   (d) Technical specifications, designs, and documentation
   (e) Any other information designated as confidential

2. OBLIGATIONS OF ${data.mutual ? 'RECEIVING PARTY' : 'THE RECEIVING PARTY'}

The ${data.mutual ? 'Party receiving Confidential Information' : 'Receiving Party'} agrees to:
   (a) Hold all Confidential Information in strict confidence
   (b) Not disclose Confidential Information to any third party without prior written consent
   (c) Use Confidential Information only for the purpose of ${data.purpose}
   (d) Protect Confidential Information with at least the same degree of care used for its own confidential information
   (e) Limit access to Confidential Information to employees and contractors with a need to know

3. EXCLUSIONS

This Agreement does not apply to information that:
   (a) Was publicly known at the time of disclosure
   (b) Becomes publicly known through no fault of the receiving party
   (c) Was rightfully in the receiving party's possession prior to disclosure
   (d) Is independently developed without use of Confidential Information
   (e) Is disclosed pursuant to a court order (with prompt notice to the disclosing party)

4. TERM

This Agreement shall remain in effect for ${data.durationYears} year(s) from the Effective Date. The obligations regarding Confidential Information shall survive termination for an additional ${data.durationYears} year(s).

5. RETURN OF MATERIALS

Upon request or termination, the receiving party shall promptly return or destroy all Confidential Information and certify such destruction in writing.

6. NO LICENSE

Nothing in this Agreement grants any license or rights to any patent, copyright, trademark, or other intellectual property.

7. NO WARRANTY

Confidential Information is provided "AS IS" without any warranty of accuracy or completeness.

8. REMEDIES

The Parties acknowledge that breach may cause irreparable harm for which monetary damages are inadequate. The disclosing party shall be entitled to seek injunctive relief in addition to other remedies.

9. GOVERNING LAW

This Agreement shall be governed by the laws of the State of Delaware, without regard to conflict of law principles.

10. ENTIRE AGREEMENT

This Agreement constitutes the entire agreement between the Parties regarding the subject matter herein.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.

${data.partyA.name.toUpperCase()}

By: _________________________________
Name:
Title:
Date:

${data.partyB.name.toUpperCase()}

By: _________________________________
Name:
Title:
Date:
`
  },

  // ============================================================================
  // TERMS OF SERVICE
  // ============================================================================
  termsOfService: {
    name: 'Terms of Service',
    description: 'Terms of Service for SaaS/web applications',
    fields: ['companyName', 'productName', 'website', 'email', 'state'],
    generate: (data: {
      companyName: string;
      productName: string;
      website: string;
      supportEmail: string;
      state: string;
      lastUpdated: string;
    }) => `
TERMS OF SERVICE

Last Updated: ${data.lastUpdated}

Welcome to ${data.productName}!

These Terms of Service ("Terms") govern your access to and use of ${data.productName} ("Service"), operated by ${data.companyName} ("Company," "we," "us," or "our").

By accessing or using the Service, you agree to be bound by these Terms. If you disagree with any part of these Terms, you may not access the Service.

1. ACCOUNTS

1.1 Account Creation. To use certain features of the Service, you must create an account. You agree to provide accurate, current, and complete information during registration.

1.2 Account Security. You are responsible for safeguarding your account credentials and for any activities under your account. Notify us immediately of any unauthorized access.

1.3 Age Requirement. You must be at least 18 years old to use the Service. By using the Service, you represent that you meet this requirement.

2. SUBSCRIPTION AND PAYMENT

2.1 Subscription Plans. The Service is offered on a subscription basis. Current pricing is available at ${data.website}/pricing.

2.2 Payment. Payment is processed through our third-party payment processor. By subscribing, you authorize us to charge your payment method on a recurring basis.

2.3 Taxes. All prices are exclusive of applicable taxes. You are responsible for paying all taxes associated with your subscription.

2.4 Refunds. Subscription fees are non-refundable except as required by law or as explicitly stated in our refund policy.

2.5 Cancellation. You may cancel your subscription at any time. Cancellation takes effect at the end of the current billing period.

3. USE OF SERVICE

3.1 License. Subject to these Terms, we grant you a limited, non-exclusive, non-transferable license to use the Service for your internal business purposes.

3.2 Restrictions. You agree NOT to:
   (a) Use the Service for any illegal purpose
   (b) Violate any laws or regulations
   (c) Infringe any intellectual property rights
   (d) Transmit malware or harmful code
   (e) Attempt to gain unauthorized access to our systems
   (f) Interfere with other users' enjoyment of the Service
   (g) Reverse engineer, decompile, or disassemble the Service
   (h) Resell, sublicense, or redistribute the Service
   (i) Use the Service to build a competing product

3.3 AI-Generated Content. The Service may generate content using artificial intelligence. You acknowledge that:
   (a) AI-generated content may not be accurate or complete
   (b) You are responsible for reviewing and verifying AI-generated content
   (c) AI-generated content should not be considered legal, financial, or professional advice
   (d) You should consult qualified professionals for specific guidance

4. INTELLECTUAL PROPERTY

4.1 Our Property. The Service, including all content, features, and functionality, is owned by ${data.companyName} and protected by intellectual property laws.

4.2 Your Content. You retain ownership of content you submit to the Service. By submitting content, you grant us a license to use, store, and process such content to provide the Service.

4.3 Feedback. Any feedback you provide may be used by us without obligation to you.

5. PRIVACY

Your privacy is important to us. Our Privacy Policy at ${data.website}/privacy describes how we collect, use, and share your information.

6. DISCLAIMER OF WARRANTIES

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.

7. LIMITATION OF LIABILITY

TO THE MAXIMUM EXTENT PERMITTED BY LAW, ${data.companyName.toUpperCase()} SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR USE, ARISING FROM YOUR USE OF THE SERVICE.

OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNTS PAID BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.

8. INDEMNIFICATION

You agree to indemnify and hold harmless ${data.companyName}, its officers, directors, employees, and agents from any claims, damages, losses, or expenses arising from your use of the Service or violation of these Terms.

9. TERMINATION

9.1 By You. You may terminate your account at any time by contacting us at ${data.supportEmail}.

9.2 By Us. We may suspend or terminate your access to the Service at any time for any reason, including violation of these Terms.

9.3 Effect of Termination. Upon termination, your right to use the Service ceases immediately. Provisions that by their nature should survive termination shall survive.

10. CHANGES TO TERMS

We may modify these Terms at any time. We will notify you of material changes by email or through the Service. Continued use after changes constitutes acceptance.

11. GOVERNING LAW

These Terms shall be governed by and construed in accordance with the laws of the State of ${data.state}, without regard to conflict of law principles.

12. DISPUTE RESOLUTION

Any dispute arising from these Terms shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. The arbitration shall take place in ${data.state}.

13. GENERAL

13.1 Entire Agreement. These Terms constitute the entire agreement between you and ${data.companyName}.

13.2 Severability. If any provision is found unenforceable, the remaining provisions shall remain in effect.

13.3 Waiver. Failure to enforce any right shall not constitute a waiver.

13.4 Assignment. You may not assign these Terms without our consent.

14. CONTACT

Questions about these Terms? Contact us:

${data.companyName}
Email: ${data.supportEmail}
Website: ${data.website}
`
  },

  // ============================================================================
  // PRIVACY POLICY
  // ============================================================================
  privacyPolicy: {
    name: 'Privacy Policy',
    description: 'GDPR and CCPA compliant privacy policy',
    fields: ['companyName', 'productName', 'website', 'email'],
    generate: (data: {
      companyName: string;
      productName: string;
      website: string;
      supportEmail: string;
      dpoEmail: string;
      lastUpdated: string;
    }) => `
PRIVACY POLICY

Last Updated: ${data.lastUpdated}

${data.companyName} ("Company," "we," "us," or "our") operates ${data.productName} (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information.

1. INFORMATION WE COLLECT

1.1 Information You Provide:
   - Account information (name, email, password)
   - Payment information (processed by our payment provider)
   - Profile information
   - Communications with us
   - Content you submit to the Service

1.2 Information Collected Automatically:
   - Device information (browser type, operating system)
   - Usage data (pages visited, features used)
   - IP address and approximate location
   - Cookies and similar technologies

1.3 Information from Third Parties:
   - Social login providers (if you choose to connect)
   - Analytics providers
   - Payment processors

2. HOW WE USE YOUR INFORMATION

We use your information to:
   - Provide and maintain the Service
   - Process transactions and send related information
   - Send administrative messages and updates
   - Respond to your comments and questions
   - Analyze usage and improve the Service
   - Detect and prevent fraud
   - Comply with legal obligations

3. HOW WE SHARE YOUR INFORMATION

We may share your information with:
   - Service providers who assist in our operations
   - Payment processors to process transactions
   - Analytics providers to understand usage
   - Legal authorities when required by law
   - Business partners with your consent

We do NOT sell your personal information.

4. DATA RETENTION

We retain your information for as long as your account is active or as needed to provide the Service. We may retain certain information for legal compliance, dispute resolution, and enforcement of our agreements.

5. YOUR RIGHTS

5.1 All Users Have the Right to:
   - Access your personal information
   - Correct inaccurate information
   - Request deletion of your information
   - Object to processing of your information
   - Data portability
   - Withdraw consent

5.2 European Users (GDPR):
You have additional rights under the General Data Protection Regulation, including the right to lodge a complaint with a supervisory authority.

Legal Basis for Processing:
   - Performance of contract (providing the Service)
   - Legitimate interests (improving the Service, security)
   - Consent (marketing communications)
   - Legal obligations (compliance with law)

5.3 California Users (CCPA):
You have the right to:
   - Know what personal information we collect
   - Request deletion of your information
   - Opt-out of sale of personal information (we do not sell)
   - Non-discrimination for exercising your rights

To exercise your rights, contact us at ${data.dpoEmail}

6. COOKIES AND TRACKING

We use cookies and similar technologies for:
   - Essential functionality (authentication, security)
   - Analytics (understanding how you use the Service)
   - Preferences (remembering your settings)

You can control cookies through your browser settings. Disabling cookies may affect Service functionality.

7. SECURITY

We implement appropriate technical and organizational measures to protect your information, including:
   - Encryption in transit and at rest
   - Access controls and authentication
   - Regular security assessments
   - Employee training

However, no method of transmission over the Internet is 100% secure.

8. INTERNATIONAL TRANSFERS

Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place, such as:
   - Standard contractual clauses
   - Adequacy decisions
   - Your consent

9. CHILDREN'S PRIVACY

The Service is not intended for children under 18. We do not knowingly collect information from children. If you believe we have collected information from a child, please contact us.

10. THIRD-PARTY LINKS

The Service may contain links to third-party websites. We are not responsible for the privacy practices of these websites.

11. CHANGES TO THIS POLICY

We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Service.

12. CONTACT US

For privacy-related inquiries:

${data.companyName}
Data Protection Officer: ${data.dpoEmail}
General Inquiries: ${data.supportEmail}
Website: ${data.website}

For EU residents, you may also contact your local data protection authority.
`
  },

  // ============================================================================
  // INDEPENDENT CONTRACTOR AGREEMENT
  // ============================================================================
  contractorAgreement: {
    name: 'Independent Contractor Agreement',
    description: 'Agreement for hiring freelancers and contractors',
    fields: ['companyName', 'contractorName', 'services', 'compensation', 'term'],
    generate: (data: {
      companyName: string;
      companyAddress: string;
      contractorName: string;
      contractorAddress: string;
      services: string;
      compensationType: 'hourly' | 'fixed' | 'milestone';
      rate: number;
      paymentTerms: string;
      startDate: string;
      endDate: string;
      state: string;
    }) => `
INDEPENDENT CONTRACTOR AGREEMENT

This Independent Contractor Agreement ("Agreement") is entered into as of ${data.startDate}

BETWEEN:

${data.companyName} ("Company")
Address: ${data.companyAddress}

AND:

${data.contractorName} ("Contractor")
Address: ${data.contractorAddress}

1. ENGAGEMENT

Company engages Contractor as an independent contractor to perform the following services ("Services"):

${data.services}

2. TERM

This Agreement begins on ${data.startDate} and continues until ${data.endDate}, unless terminated earlier in accordance with this Agreement.

3. COMPENSATION

3.1 Rate. Company shall pay Contractor:
${data.compensationType === 'hourly'
  ? `$${data.rate} per hour for Services performed`
  : data.compensationType === 'fixed'
  ? `A fixed fee of $${data.rate} for completion of the Services`
  : `Milestone-based payments totaling $${data.rate} as detailed in Exhibit A`}

3.2 Payment Terms. ${data.paymentTerms}

3.3 Expenses. Contractor shall be responsible for all expenses unless pre-approved in writing by Company.

4. INDEPENDENT CONTRACTOR STATUS

4.1 Contractor is an independent contractor, not an employee. Contractor shall:
   - Determine the method and means of performing Services
   - Provide own equipment and tools
   - Be responsible for own taxes (federal, state, local)
   - Not be entitled to employee benefits

4.2 Contractor shall complete IRS Form W-9 prior to first payment.

5. CONFIDENTIALITY

5.1 Contractor agrees to maintain strict confidentiality of all Company information, including but not limited to business plans, customer lists, financial information, and technical data.

5.2 This obligation survives termination of this Agreement.

6. INTELLECTUAL PROPERTY

6.1 Work Product. All work product created by Contractor in connection with the Services ("Work Product") shall be the sole property of Company.

6.2 Assignment. Contractor hereby assigns to Company all rights, title, and interest in the Work Product, including all intellectual property rights.

6.3 Prior Work. Any materials owned by Contractor prior to this engagement remain Contractor's property. Contractor grants Company a license to use such materials incorporated into the Work Product.

7. REPRESENTATIONS AND WARRANTIES

Contractor represents and warrants that:
   - Contractor has the right to enter into this Agreement
   - The Services will be performed in a professional manner
   - The Work Product will not infringe any third-party rights
   - Contractor has all necessary skills and qualifications

8. INDEMNIFICATION

Contractor shall indemnify and hold harmless Company from any claims arising from Contractor's breach of this Agreement or negligent acts.

9. TERMINATION

9.1 Either party may terminate this Agreement with 14 days written notice.

9.2 Company may terminate immediately for cause, including breach of this Agreement.

9.3 Upon termination, Contractor shall deliver all Work Product and Company materials.

10. NON-SOLICITATION

During the term and for 12 months after, Contractor shall not solicit Company's employees or customers.

11. GENERAL PROVISIONS

11.1 Governing Law. This Agreement shall be governed by the laws of ${data.state}.

11.2 Entire Agreement. This Agreement constitutes the entire agreement between the parties.

11.3 Amendment. This Agreement may only be amended in writing signed by both parties.

11.4 Severability. If any provision is unenforceable, the remaining provisions remain in effect.

IN WITNESS WHEREOF, the parties have executed this Agreement.

${data.companyName.toUpperCase()}

By: _________________________________
Name:
Title:
Date:

${data.contractorName.toUpperCase()}

By: _________________________________
Date:
`
  }
};

export type LegalTemplateKey = keyof typeof LEGAL_TEMPLATES;

export function generateLegalDocument(templateKey: LegalTemplateKey, data: any): string {
  const template = LEGAL_TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Template not found: ${templateKey}`);
  }
  return template.generate(data);
}

export function listLegalTemplates() {
  return Object.entries(LEGAL_TEMPLATES).map(([key, value]) => ({
    key,
    name: value.name,
    description: value.description,
    fields: value.fields
  }));
}
