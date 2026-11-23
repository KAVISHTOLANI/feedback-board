import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('Signal Board', () => {
  it('flags a likely duplicate while typing and adds it as a mention', async () => {
    window.location.hash = '/inbox';
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Title'), 'CSV export times out');
    const box = screen.getByRole('region', { name: 'Possibly the same as' });
    expect(within(box).getByText('CSV export times out on large projects')).toBeInTheDocument();
    await user.click(within(box).getAllByRole('button', { name: 'Add as a mention' })[0]);
    expect(screen.getByText(/Added as another mention of “CSV export times out on large projects” \(4 mentions\)/)).toBeInTheDocument();
  });

  it('validates and logs new feedback', async () => {
    window.location.hash = '/inbox';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Log as new item' }));
    expect(screen.getByText('Summarise the feedback in a short title.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Title'), 'Keyboard shortcuts for the editor');
    await user.click(screen.getByRole('button', { name: 'Log as new item' }));
    expect(screen.getByText('Logged “Keyboard shortcuts for the editor”.')).toBeInTheDocument();
  });

  it('scores an item with RICE and merges a duplicate', async () => {
    window.location.hash = '/item/demo-csv2';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    expect(screen.getByText(/Estimate how many people/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Reach'), '400');
    await user.type(screen.getByLabelText('Effort'), '2');
    await user.click(screen.getByRole('button', { name: 'Save score' }));
    expect(screen.getByText('Scored — RICE 160.')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('Triaged');
    await user.click(screen.getAllByRole('button', { name: 'Merge into this' })[0]);
    expect(screen.getByText(/Merged — now 4 mentions/)).toBeInTheDocument();
  });

  it('moves a card across the board', async () => {
    window.location.hash = '/board';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Move “Dark mode” to Planned' }));
    const planned = screen.getByRole('heading', { name: /^Planned/ }).closest('section')!;
    expect(within(planned).getByText('Dark mode')).toBeInTheDocument();
  });

  it('ranks open items by RICE with a matrix', () => {
    window.location.hash = '/priorities';
    render(<App />);
    expect(screen.getByRole('img', { name: /Impact versus effort/ })).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('New users can’t find where to invite teammates');
    expect(screen.getByText(/4 open items aren’t scored yet/)).toBeInTheDocument();
  });
});
