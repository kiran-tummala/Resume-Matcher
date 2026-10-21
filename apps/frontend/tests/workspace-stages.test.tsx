import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { money, RateBar, STAGE, BOARD_STAGES } from '@/components/workspace/stages';
import { SUBMISSION_STATUS_ORDER } from '@/lib/api/bench';

describe('workspace stages', () => {
  it('formats rates without trailing zeros', () => {
    expect(money(95)).toBe('$95');
    expect(money(95.5)).toBe('$95.50');
    expect(money(-10)).toBe('-$10');
    expect(money(null)).toBe('—');
  });

  it('has a label for every submission status, and the board shows them all', () => {
    expect(Object.keys(STAGE).sort()).toEqual([...SUBMISSION_STATUS_ORDER].sort());
    expect([...BOARD_STAGES].sort()).toEqual([...SUBMISSION_STATUS_ORDER].sort());
  });
});

describe('RateBar', () => {
  it('describes bill, pay and margin for screen readers', () => {
    render(<RateBar bill={95} pay={70} />);
    expect(screen.getByRole('img', { name: 'Bill $95 an hour, pay $70, margin $25' })).toBeTruthy();
  });

  it('shows a negative margin in red', () => {
    render(<RateBar bill={60} pay={70} />);
    const margin = screen.getByText('-$10/hr');
    expect(margin.className).toContain('text-bp-red');
  });

  it('says when rates are missing', () => {
    render(<RateBar bill={null} pay={70} />);
    expect(screen.getByText('Rates not set')).toBeTruthy();
  });
});
