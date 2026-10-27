import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SafetyChapter } from './SafetyChapter';
import { V2SceneProvider } from './V2Scene';
import { ROLES } from './content';

describe('homepage safety and provisioning content', () => {
  it('separates non-controlling homepage illustrations from existing permission-gated execution', () => {
    const html = renderToStaticMarkup(<V2SceneProvider><SafetyChapter /></V2SceneProvider>);
    expect(html).toContain('illustrations on this homepage never send commands');
    expect(html).toContain('Run on robot for eligible attempts');
    expect(html).toContain('server checks permissions, classroom scope');
    expect(html).toContain('supervisor approval');
    expect(html).not.toMatch(/locked in this release|no control on VISTA|no lesson sends|not controls in VISTA today/i);
  });

  it('describes a local CSV preview followed by confirmed account provisioning', () => {
    const school = ROLES.find(role => role.id === 'school');
    expect(school?.points.join(' ')).toMatch(/preview CSV rows locally, then confirm import to provision eligible accounts and school memberships/i);
    expect(school?.points.join(' ')).not.toContain('does not create accounts yet');
  });
});
