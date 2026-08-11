/**
 * Tests for OtpInput (src/components/common/OtpInput.tsx).
 *
 * The paste case is the one that matters. Operators overwhelmingly copy the
 * code from their phone or password manager rather than retyping it, and the
 * naive per-box implementation of this control drops five of the six digits on
 * paste — it is the single most common way this widget gets built wrong, and it
 * is invisible until someone actually tries to paste.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import OtpInput from './OtpInput';

/** Controlled wrapper, since the component owns no value of its own. */
function Harness({ onComplete }: { onComplete?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <OtpInput value={value} onChange={setValue} onComplete={onComplete} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const boxes = () => screen.getAllByRole('textbox') as HTMLInputElement[];
const currentValue = () => screen.getByTestId('value').textContent;

describe('OtpInput', () => {
  it('renders one box per digit, labelled for screen readers', () => {
    render(<Harness />);
    expect(boxes()).toHaveLength(6);
    expect(screen.getByLabelText('Digit 1 of 6')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '6-digit verification code' })).toBeInTheDocument();
  });

  it('ACCEPTS A PASTED CODE in full', () => {
    render(<Harness />);
    fireEvent.paste(boxes()[0], {
      clipboardData: { getData: () => '123456' },
    });
    expect(currentValue()).toBe('123456');
  });

  it('strips formatting from a pasted code', () => {
    render(<Harness />);
    fireEvent.paste(boxes()[0], {
      clipboardData: { getData: () => ' 123 456 ' },
    });
    expect(currentValue()).toBe('123456');
  });

  it('ignores a pasted code longer than the input', () => {
    render(<Harness />);
    fireEvent.paste(boxes()[0], {
      clipboardData: { getData: () => '1234567890' },
    });
    expect(currentValue()).toBe('123456');
  });

  it('fires onComplete once the last digit lands, including via paste', () => {
    const onComplete = jest.fn();
    render(<Harness onComplete={onComplete} />);
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => '123456' } });
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('accepts typing digit by digit', () => {
    render(<Harness />);
    fireEvent.change(boxes()[0], { target: { value: '1' } });
    fireEvent.change(boxes()[1], { target: { value: '2' } });
    expect(currentValue()).toBe('12');
  });

  it('rejects non-numeric input', () => {
    render(<Harness />);
    fireEvent.change(boxes()[0], { target: { value: 'a' } });
    expect(currentValue()).toBe('');
  });

  it('handles a multi-character autofill delivered to one box', () => {
    // Android and some password managers deliver the whole code as a single
    // input event rather than six.
    render(<Harness />);
    fireEvent.change(boxes()[0], { target: { value: '123456' } });
    expect(currentValue()).toBe('123456');
  });

  it('deletes backwards through the boxes', () => {
    render(<Harness />);
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => '123' } });
    expect(currentValue()).toBe('123');

    fireEvent.keyDown(boxes()[2], { key: 'Backspace' });
    expect(currentValue()).toBe('12');

    // On an already-empty box, backspace clears the PREVIOUS one.
    fireEvent.keyDown(boxes()[2], { key: 'Backspace' });
    expect(currentValue()).toBe('1');
  });

  it('advertises one-time-code on the first box only', () => {
    // Six competing autofill targets make the browser offer the code six times.
    render(<Harness />);
    expect(boxes()[0]).toHaveAttribute('autocomplete', 'one-time-code');
    expect(boxes()[1]).toHaveAttribute('autocomplete', 'off');
  });

  it('uses a numeric keypad on mobile', () => {
    render(<Harness />);
    for (const box of boxes()) expect(box).toHaveAttribute('inputmode', 'numeric');
  });
});
