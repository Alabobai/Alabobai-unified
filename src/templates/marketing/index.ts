/**
 * Alabobai Marketing Department Templates
 * Marketing Campaigns, Ad Copy, Social Media, Email Marketing
 */

export const MARKETING_TEMPLATES = {
  // ============================================================================
  // MARKETING CAMPAIGN BRIEF
  // ============================================================================
  campaignBrief: {
    name: 'Marketing Campaign Brief',
    description: 'Comprehensive campaign planning document',
    fields: ['campaignName', 'objectives', 'audience', 'budget', 'timeline'],
    generate: (data: {
      companyName: string;
      campaignName: string;
      campaignType: 'brand-awareness' | 'lead-generation' | 'product-launch' | 'seasonal' | 'event';
      objectives: Array<{
        objective: string;
        metric: string;
        target: string;
      }>;
      targetAudience: {
        demographics: string;
        psychographics: string;
        painPoints: string[];
        channels: string[];
      };
      keyMessages: string[];
      budget: {
        total: number;
        breakdown: Array<{ category: string; amount: number }>;
      };
      timeline: {
        startDate: string;
        endDate: string;
        phases: Array<{
          name: string;
          dates: string;
          activities: string[];
        }>;
      };
      creativeRequirements: string[];
      competitors?: string[];
    }) => `
================================================================================
${data.companyName.toUpperCase()}
MARKETING CAMPAIGN BRIEF
================================================================================

Campaign Name:    ${data.campaignName}
Campaign Type:    ${data.campaignType.replace('-', ' ').toUpperCase()}
Date Created:     ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

================================================================================
CAMPAIGN OVERVIEW
================================================================================

Campaign Duration: ${data.timeline.startDate} - ${data.timeline.endDate}
Total Budget:      $${data.budget.total.toLocaleString()}

================================================================================
OBJECTIVES & KPIs
================================================================================

${data.objectives.map((obj, i) => `
OBJECTIVE ${i + 1}: ${obj.objective}
  Metric: ${obj.metric}
  Target: ${obj.target}
`).join('\n')}

================================================================================
TARGET AUDIENCE
================================================================================

DEMOGRAPHICS
--------------------------------------------------------------------------------
${data.targetAudience.demographics}

PSYCHOGRAPHICS
--------------------------------------------------------------------------------
${data.targetAudience.psychographics}

PAIN POINTS
--------------------------------------------------------------------------------
${data.targetAudience.painPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

PREFERRED CHANNELS
--------------------------------------------------------------------------------
${data.targetAudience.channels.map((c, i) => `${i + 1}. ${c}`).join('\n')}

================================================================================
KEY MESSAGES
================================================================================

Primary Message:
${data.keyMessages[0] || ''}

Supporting Messages:
${data.keyMessages.slice(1).map((m, i) => `${i + 1}. ${m}`).join('\n')}

Message Pillars:
  1. _______________
  2. _______________
  3. _______________

================================================================================
BUDGET BREAKDOWN
================================================================================

| Category | Budget | % of Total |
|----------|--------|------------|
${data.budget.breakdown.map(b =>
`| ${b.category.padEnd(25)} | $${b.amount.toLocaleString().padStart(10)} | ${((b.amount / data.budget.total) * 100).toFixed(1).padStart(8)}% |`
).join('\n')}
|---------------------------|------------|------------|
| TOTAL                     | $${data.budget.total.toLocaleString().padStart(10)} |    100.0% |

================================================================================
CAMPAIGN TIMELINE
================================================================================

${data.timeline.phases.map((phase, i) => `
PHASE ${i + 1}: ${phase.name}
Dates: ${phase.dates}
--------------------------------------------------------------------------------
${phase.activities.map((a, j) => `  [ ] ${a}`).join('\n')}
`).join('\n')}

================================================================================
CREATIVE REQUIREMENTS
================================================================================

${data.creativeRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Deliverables Checklist:
[ ] Brand guidelines review
[ ] Creative brief approval
[ ] Asset development
[ ] Copy approval
[ ] Final review and QA
[ ] Asset distribution

================================================================================
CHANNEL STRATEGY
================================================================================

ORGANIC CHANNELS
--------------------------------------------------------------------------------
[ ] Website / Blog
[ ] Email Marketing
[ ] Social Media (organic)
[ ] SEO
[ ] PR / Earned Media

PAID CHANNELS
--------------------------------------------------------------------------------
[ ] Paid Social (Facebook, Instagram, LinkedIn, Twitter)
[ ] Paid Search (Google Ads, Bing)
[ ] Display Advertising
[ ] Programmatic
[ ] Influencer Marketing
[ ] Podcast Advertising

${data.competitors && data.competitors.length > 0 ? `
================================================================================
COMPETITIVE LANDSCAPE
================================================================================

${data.competitors.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Differentiation Strategy:
_______________________________________________________________
_______________________________________________________________
` : ''}

================================================================================
APPROVAL SIGN-OFF
================================================================================

Campaign Brief Prepared By:

_________________________________________  Date: ____________
Marketing Manager

Approved By:

_________________________________________  Date: ____________
VP of Marketing

_________________________________________  Date: ____________
CMO / Executive Sponsor

================================================================================
                    Generated by Alabobai Marketing Department
================================================================================
`
  },

  // ============================================================================
  // AD COPY VARIATIONS
  // ============================================================================
  adCopy: {
    name: 'Ad Copy Variations',
    description: 'Multi-platform advertising copy',
    fields: ['productName', 'headline', 'benefits', 'cta'],
    generate: (data: {
      companyName: string;
      productName: string;
      tagline: string;
      benefits: string[];
      uniqueSellingPoint: string;
      targetAudience: string;
      tone: 'professional' | 'casual' | 'urgent' | 'playful' | 'inspirational';
      callToAction: string;
      offer?: string;
    }) => `
================================================================================
${data.companyName.toUpperCase()}
AD COPY VARIATIONS
================================================================================

Product/Service: ${data.productName}
Target Audience: ${data.targetAudience}
Tone: ${data.tone.toUpperCase()}
Date: ${new Date().toLocaleDateString()}

================================================================================
GOOGLE ADS
================================================================================

RESPONSIVE SEARCH AD - HEADLINES (30 char max)
--------------------------------------------------------------------------------
H1: ${data.productName.substring(0, 30)}
H2: ${data.benefits[0]?.substring(0, 30) || ''}
H3: ${data.uniqueSellingPoint.substring(0, 30)}
H4: ${data.offer?.substring(0, 30) || data.callToAction.substring(0, 30)}
H5: Try ${data.productName} Today
H6: ${data.tagline.substring(0, 30)}
H7: Trusted by Thousands
H8: Get Started Free
H9: See Why Teams Love Us
H10: ${data.benefits[1]?.substring(0, 30) || 'Transform Your Business'}
H11: No Credit Card Required
H12: Start Your Free Trial
H13: Join 10,000+ Companies
H14: ${data.benefits[2]?.substring(0, 30) || 'Boost Your Productivity'}
H15: Limited Time Offer

RESPONSIVE SEARCH AD - DESCRIPTIONS (90 char max)
--------------------------------------------------------------------------------
D1: ${data.uniqueSellingPoint.substring(0, 90)}
D2: ${data.benefits.join('. ').substring(0, 90)}
D3: ${data.offer ? data.offer.substring(0, 90) : `Try ${data.productName} risk-free. Start your free trial today.`}
D4: Join thousands of satisfied customers. ${data.callToAction.substring(0, 50)}

================================================================================
FACEBOOK / INSTAGRAM ADS
================================================================================

PRIMARY TEXT - VERSION 1 (Benefit-focused)
--------------------------------------------------------------------------------
${data.benefits[0]}

${data.productName} helps you ${data.benefits[1]?.toLowerCase() || 'achieve more'}.

${data.offer || ''}

${data.callToAction} 👉

PRIMARY TEXT - VERSION 2 (Problem-Agitation-Solution)
--------------------------------------------------------------------------------
Tired of [problem]?

You're not alone. [Agitation point]

That's why we created ${data.productName}.

${data.uniqueSellingPoint}

${data.callToAction} 🚀

PRIMARY TEXT - VERSION 3 (Social Proof)
--------------------------------------------------------------------------------
"${data.productName} changed everything for our team." - Happy Customer

Join 10,000+ professionals who trust ${data.productName} for:
${data.benefits.map(b => `✓ ${b}`).join('\n')}

${data.callToAction}

HEADLINES (40 char max for FB)
--------------------------------------------------------------------------------
- ${data.tagline.substring(0, 40)}
- ${data.callToAction.substring(0, 40)}
- Try ${data.productName} Free
- ${data.benefits[0]?.substring(0, 40) || ''}

LINK DESCRIPTIONS
--------------------------------------------------------------------------------
- ${data.uniqueSellingPoint.substring(0, 30)}
- ${data.offer?.substring(0, 30) || 'Start Free Trial'}
- No credit card required

================================================================================
LINKEDIN ADS
================================================================================

SPONSORED CONTENT
--------------------------------------------------------------------------------
[Image: Professional, clean design featuring product]

${data.productName}: ${data.tagline}

In today's competitive landscape, ${data.targetAudience.toLowerCase()} need every advantage.

${data.productName} delivers:
${data.benefits.map(b => `• ${b}`).join('\n')}

${data.uniqueSellingPoint}

${data.callToAction}

#${data.productName.replace(/\s+/g, '')} #BusinessGrowth #Productivity

================================================================================
TWITTER / X ADS
================================================================================

TWEET 1 (280 char max)
--------------------------------------------------------------------------------
${data.tagline}

${data.benefits[0]}

${data.callToAction} ⬇️

[Link]

TWEET 2 (280 char max)
--------------------------------------------------------------------------------
Stop [pain point]. Start [benefit].

${data.productName} helps ${data.targetAudience.toLowerCase()} ${data.benefits[1]?.toLowerCase() || 'succeed'}.

Try it free 👉 [Link]

TWEET 3 (280 char max)
--------------------------------------------------------------------------------
Why do 10,000+ professionals choose ${data.productName}?

${data.benefits.slice(0, 2).map(b => `✓ ${b}`).join('\n')}

Join them: [Link]

================================================================================
YOUTUBE ADS
================================================================================

BUMPER AD (6 seconds)
--------------------------------------------------------------------------------
[Visual: Quick product showcase]
VO: "${data.productName}. ${data.tagline}"
Super: ${data.callToAction}

SKIPPABLE IN-STREAM AD (15-30 seconds)
--------------------------------------------------------------------------------
:00-:05  Hook: "What if you could [main benefit]?"
:05-:15  Problem: Common pain points for target audience
:15-:25  Solution: Introduce ${data.productName} with key benefits
:25-:30  CTA: "${data.callToAction}" with offer

Script:
"Are you tired of [problem]?

${data.productName} is the solution you've been looking for.

With ${data.productName}, you can:
- ${data.benefits[0]}
- ${data.benefits[1]}
- ${data.benefits[2] || 'And so much more'}

${data.offer || 'Try it free today.'}

${data.callToAction}"

================================================================================
DISPLAY ADS
================================================================================

BANNER HEADLINES
--------------------------------------------------------------------------------
Large (728x90):  ${data.tagline} | ${data.callToAction}
Medium (300x250): ${data.benefits[0]} | ${data.callToAction}
Small (300x50):   ${data.productName} - ${data.callToAction}

BANNER BODY COPY
--------------------------------------------------------------------------------
- ${data.uniqueSellingPoint}
- ${data.offer || 'Start Free Today'}
- Trusted by 10,000+ teams

================================================================================
A/B TESTING NOTES
================================================================================

Test Variables:
[ ] Headline variations
[ ] Benefit order
[ ] CTA button text
[ ] Image vs. video
[ ] Audience segments
[ ] Ad placements

Success Metrics:
- CTR (Click-through rate)
- CPC (Cost per click)
- Conversion rate
- ROAS (Return on ad spend)

================================================================================
                    Generated by Alabobai Marketing Department
================================================================================
`
  },

  // ============================================================================
  // EMAIL MARKETING SEQUENCE
  // ============================================================================
  emailSequence: {
    name: 'Email Marketing Sequence',
    description: 'Automated email drip campaign',
    fields: ['sequenceName', 'trigger', 'emails', 'goal'],
    generate: (data: {
      companyName: string;
      sequenceName: string;
      sequenceType: 'welcome' | 'onboarding' | 'nurture' | 'abandoned-cart' | 're-engagement' | 'sales';
      goal: string;
      fromName: string;
      fromEmail: string;
      emails: Array<{
        day: number;
        subject: string;
        preheader: string;
        purpose: string;
        keyPoints: string[];
        cta: string;
      }>;
    }) => `
================================================================================
${data.companyName.toUpperCase()}
EMAIL MARKETING SEQUENCE
================================================================================

Sequence Name: ${data.sequenceName}
Sequence Type: ${data.sequenceType.toUpperCase()}
Goal:          ${data.goal}

From Name:     ${data.fromName}
From Email:    ${data.fromEmail}

================================================================================
SEQUENCE OVERVIEW
================================================================================

Total Emails:  ${data.emails.length}
Duration:      ${Math.max(...data.emails.map(e => e.day))} days

Trigger: [Define trigger - e.g., "User signs up", "Cart abandoned", etc.]

================================================================================
EMAIL SEQUENCE
================================================================================

${data.emails.map((email, i) => `
--------------------------------------------------------------------------------
EMAIL ${i + 1} | DAY ${email.day}
--------------------------------------------------------------------------------

SUBJECT LINE:
${email.subject}

PREHEADER:
${email.preheader}

PURPOSE:
${email.purpose}

KEY POINTS:
${email.keyPoints.map((p, j) => `  ${j + 1}. ${p}`).join('\n')}

CALL TO ACTION:
[${email.cta}]

EMAIL BODY TEMPLATE:
--------------------------------------------------------------------------------

Hi {{first_name}},

[Opening - Hook relevant to purpose]

${email.keyPoints[0]}

[Expand on key point 1]

${email.keyPoints[1] || ''}

[Supporting content]

${email.keyPoints[2] || ''}

[Transition to CTA]

[CTA BUTTON: ${email.cta}]

[Closing - Sign off]

Best,
${data.fromName}
${data.companyName}

P.S. [Optional PS line for emphasis]

--------------------------------------------------------------------------------
`).join('\n')}

================================================================================
SEQUENCE SETTINGS
================================================================================

Send Time Optimization:
[ ] Send at subscriber's optimal time
[ ] Fixed time: _____ AM/PM EST
[ ] Business hours only

Exit Conditions:
[ ] Unsubscribe
[ ] Goal achieved (conversion)
[ ] Hard bounce
[ ] Manual removal

================================================================================
A/B TESTING PLAN
================================================================================

Elements to Test:
[ ] Subject lines
[ ] Send times
[ ] CTA button text
[ ] CTA button color
[ ] Email length
[ ] Personalization

Test Duration: ____ days per test
Minimum Sample Size: ____ subscribers
Confidence Level: 95%

================================================================================
PERFORMANCE METRICS
================================================================================

Email Performance Benchmarks:

| Metric | Target | Industry Avg |
|--------|--------|--------------|
| Open Rate | ___% | 20-25% |
| Click Rate | ___% | 2-5% |
| Conversion Rate | ___% | 1-3% |
| Unsubscribe Rate | <___% | <0.5% |

================================================================================
TECHNICAL REQUIREMENTS
================================================================================

[ ] Email templates created in ESP
[ ] Personalization tokens configured
[ ] Links tracked with UTM parameters
[ ] Unsubscribe link included
[ ] Physical address in footer
[ ] Mobile responsive design
[ ] Plain text version created
[ ] Preview tested across clients

UTM Parameters:
- utm_source: email
- utm_medium: ${data.sequenceType}
- utm_campaign: ${data.sequenceName.toLowerCase().replace(/\s+/g, '-')}

================================================================================
APPROVAL
================================================================================

Copy Approved By: _____________ Date: _______
Design Approved By: _____________ Date: _______
Final QA Completed: _____________ Date: _______
Sequence Activated: _____________ Date: _______

================================================================================
                    Generated by Alabobai Marketing Department
================================================================================
`
  },

  // ============================================================================
  // SOCIAL MEDIA CONTENT CALENDAR
  // ============================================================================
  socialMediaCalendar: {
    name: 'Social Media Content Calendar',
    description: 'Weekly/monthly social media planning',
    fields: ['month', 'platforms', 'themes', 'posts'],
    generate: (data: {
      companyName: string;
      month: string;
      year: number;
      platforms: string[];
      themes: string[];
      contentPillars: string[];
      postingSchedule: {
        platform: string;
        frequency: string;
        bestTimes: string;
      }[];
      keyDates: Array<{ date: string; event: string }>;
      hashtags: string[];
    }) => `
================================================================================
${data.companyName.toUpperCase()}
SOCIAL MEDIA CONTENT CALENDAR
${data.month.toUpperCase()} ${data.year}
================================================================================

================================================================================
OVERVIEW
================================================================================

Platforms:       ${data.platforms.join(', ')}
Monthly Themes:  ${data.themes.join(', ')}

================================================================================
CONTENT PILLARS
================================================================================

${data.contentPillars.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Content Mix:
- Educational: 40%
- Engaging: 30%
- Promotional: 20%
- User-Generated: 10%

================================================================================
POSTING SCHEDULE
================================================================================

| Platform | Frequency | Best Times |
|----------|-----------|------------|
${data.postingSchedule.map(s =>
`| ${s.platform.padEnd(12)} | ${s.frequency.padEnd(15)} | ${s.bestTimes} |`
).join('\n')}

================================================================================
KEY DATES & EVENTS
================================================================================

${data.keyDates.map(d => `${d.date}: ${d.event}`).join('\n')}

================================================================================
WEEKLY CONTENT TEMPLATE
================================================================================

MONDAY - [Theme: Educational]
--------------------------------------------------------------------------------
Platform:    _____________
Post Type:   [Image/Video/Carousel/Story]
Topic:       _____________
Caption:     _____________
Hashtags:    _____________
CTA:         _____________
Link:        _____________

TUESDAY - [Theme: Engaging]
--------------------------------------------------------------------------------
Platform:    _____________
Post Type:   [Image/Video/Carousel/Story]
Topic:       _____________
Caption:     _____________
Hashtags:    _____________
CTA:         _____________
Link:        _____________

WEDNESDAY - [Theme: Behind-the-Scenes]
--------------------------------------------------------------------------------
Platform:    _____________
Post Type:   [Image/Video/Carousel/Story]
Topic:       _____________
Caption:     _____________
Hashtags:    _____________
CTA:         _____________
Link:        _____________

THURSDAY - [Theme: Tips & Tricks]
--------------------------------------------------------------------------------
Platform:    _____________
Post Type:   [Image/Video/Carousel/Story]
Topic:       _____________
Caption:     _____________
Hashtags:    _____________
CTA:         _____________
Link:        _____________

FRIDAY - [Theme: Community/Fun]
--------------------------------------------------------------------------------
Platform:    _____________
Post Type:   [Image/Video/Carousel/Story]
Topic:       _____________
Caption:     _____________
Hashtags:    _____________
CTA:         _____________
Link:        _____________

WEEKEND - [Theme: Lifestyle/Inspiration]
--------------------------------------------------------------------------------
Platform:    _____________
Post Type:   [Image/Video/Carousel/Story]
Topic:       _____________
Caption:     _____________
Hashtags:    _____________
CTA:         _____________
Link:        _____________

================================================================================
HASHTAG STRATEGY
================================================================================

Branded Hashtags:
#${data.companyName.replace(/\s+/g, '')}

Industry Hashtags:
${data.hashtags.map(h => `#${h}`).join(' ')}

Campaign Hashtags:
#[CampaignSpecific]

================================================================================
ENGAGEMENT STRATEGY
================================================================================

Daily Tasks:
[ ] Respond to comments within 2 hours
[ ] Engage with 10 relevant posts
[ ] Monitor brand mentions
[ ] Share user-generated content

Weekly Tasks:
[ ] Analyze top-performing posts
[ ] Review competitor activity
[ ] Update hashtag research
[ ] Plan next week's content

Monthly Tasks:
[ ] Full analytics review
[ ] Content audit
[ ] Strategy adjustment
[ ] ROI reporting

================================================================================
METRICS TO TRACK
================================================================================

| Metric | Target | Week 1 | Week 2 | Week 3 | Week 4 |
|--------|--------|--------|--------|--------|--------|
| Followers | +___% | | | | |
| Engagement Rate | ___% | | | | |
| Reach | ____K | | | | |
| Impressions | ____K | | | | |
| Link Clicks | ____ | | | | |
| Profile Visits | ____ | | | | |

================================================================================
CONTENT ASSETS NEEDED
================================================================================

[ ] Product photos
[ ] Team photos
[ ] Behind-the-scenes content
[ ] User testimonials
[ ] Infographics
[ ] Video content
[ ] Stories templates
[ ] Reel/TikTok scripts

================================================================================
APPROVAL WORKFLOW
================================================================================

1. Content creation
2. Copy review
3. Design review
4. Final approval
5. Schedule in tool
6. Publish and monitor

================================================================================
                    Generated by Alabobai Marketing Department
================================================================================
`
  },

  // ============================================================================
  // PRESS RELEASE
  // ============================================================================
  pressRelease: {
    name: 'Press Release',
    description: 'Official press release template',
    fields: ['headline', 'subheadline', 'body', 'boilerplate', 'contact'],
    generate: (data: {
      companyName: string;
      headline: string;
      subheadline?: string;
      city: string;
      state: string;
      releaseDate: string;
      releaseType: 'FOR IMMEDIATE RELEASE' | 'EMBARGOED UNTIL';
      embargoDate?: string;
      body: string[];
      quotes: Array<{
        quote: string;
        speaker: string;
        title: string;
      }>;
      boilerplate: string;
      mediaContact: {
        name: string;
        email: string;
        phone: string;
      };
      additionalResources?: string[];
    }) => `
================================================================================
PRESS RELEASE
================================================================================

${data.releaseType}${data.releaseType === 'EMBARGOED UNTIL' ? `: ${data.embargoDate}` : ''}

================================================================================

${data.headline.toUpperCase()}

${data.subheadline || ''}

================================================================================

${data.city}, ${data.state} - ${data.releaseDate} - ${data.body[0]}

${data.body.slice(1).join('\n\n')}

${data.quotes.map(q => `
"${q.quote}" said ${q.speaker}, ${q.title} of ${data.companyName}.
`).join('\n')}

${data.additionalResources && data.additionalResources.length > 0 ? `
For more information, visit:
${data.additionalResources.map(r => `- ${r}`).join('\n')}
` : ''}

================================================================================
ABOUT ${data.companyName.toUpperCase()}
================================================================================

${data.boilerplate}

================================================================================
MEDIA CONTACT
================================================================================

${data.mediaContact.name}
${data.companyName}
Email: ${data.mediaContact.email}
Phone: ${data.mediaContact.phone}

###

================================================================================
                    Generated by Alabobai Marketing Department
================================================================================
`
  }
};

export type MarketingTemplateKey = keyof typeof MARKETING_TEMPLATES;

export function generateMarketingDocument(templateKey: MarketingTemplateKey, data: any): string {
  const template = MARKETING_TEMPLATES[templateKey];
  if (!template) {
    throw new Error(`Template not found: ${templateKey}`);
  }
  return template.generate(data);
}

export function listMarketingTemplates() {
  return Object.entries(MARKETING_TEMPLATES).map(([key, value]) => ({
    key,
    name: value.name,
    description: value.description,
    fields: value.fields
  }));
}
