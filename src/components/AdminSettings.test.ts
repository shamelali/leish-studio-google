import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminSettings from './AdminSettings';

describe('admin settings security copy', () => {
  it('does not render admin credentials and uses generic configuration labels', () => {
    const html = renderToStaticMarkup(React.createElement(AdminSettings));

    expect(html).toContain('Credentials are not displayed here.');
    expect(html).toContain('Managed through authentication');
    expect(html).toContain('Configured storage');
    expect(html).toContain('Configured authentication');
    expect(html).toContain('Configured email service');
    expect(html).not.toContain('Bootstrap admin:');
  });
});
