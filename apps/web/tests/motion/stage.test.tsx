// Phase 2: stage transitions, focus handling, the progress line and the animated modals. The
// animation features are not loaded here (they load lazily in the real app), so every swap is
// immediate, which is what keeps tests free of timing.
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { StageHeader } from '../../src/components/StageHeader';
import { StageTransition } from '../../src/components/StageTransition';
import { TopNav, STAGES } from '../../src/components/TopNav';

afterEach(cleanup);

const noop = () => {};

describe('StageTransition', () => {
  it('shows only the current stage and swaps when the key changes', () => {
    const { rerender } = render(
      <StageTransition stageKey="A">
        <p>stage a</p>
      </StageTransition>,
    );
    expect(screen.getByText('stage a')).toBeTruthy();
    rerender(
      <StageTransition stageKey="B">
        <p>stage b</p>
      </StageTransition>,
    );
    expect(screen.getByText('stage b')).toBeTruthy();
    expect(screen.queryByText('stage a')).toBeNull();
  });
});

describe('StageHeader focus', () => {
  it('does not take focus when first shown, even under React strict mode', () => {
    render(
      <StrictMode>
        <StageHeader stage="MANDATE" onStage={noop} />
      </StrictMode>,
    );
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the new stage heading after the stage changes', () => {
    const { rerender } = render(<StageHeader stage="MANDATE" onStage={noop} />);
    rerender(<StageHeader stage="STRUCTURE" onStage={noop} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/Choose a product/);
    expect(document.activeElement).toBe(heading);
  });

  it('leaves focus alone when re-rendered on the same stage', () => {
    const { rerender } = render(<StageHeader stage="SIMULATE" onStage={noop} />);
    const other = document.createElement('button');
    document.body.append(other);
    other.focus();
    rerender(<StageHeader stage="SIMULATE" onStage={noop} onPrint={noop} />);
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});

describe('stage progress line', () => {
  it('fills in fifths as the user moves through the five stages', () => {
    const { rerender } = render(
      <TopNav
        stage="MANDATE"
        onStage={noop}
        runCount={0}
        onOpenRuns={noop}
        loading={false}
        elapsedSeconds={0}
      />,
    );
    STAGES.forEach(({ id }, index) => {
      rerender(
        <TopNav
          stage={id}
          onStage={noop}
          runCount={0}
          onOpenRuns={noop}
          loading={false}
          elapsedSeconds={0}
        />,
      );
      const bar = screen.getByTestId('stage-progress');
      expect(bar.getAttribute('style')).toContain(`scaleX(${(index + 1) / STAGES.length})`);
      expect(bar.parentElement?.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

describe('the journey in the app', () => {
  it('moves between stages with focus on the new heading and the old stage gone', () => {
    render(<App startOnDesk />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/client mandate/i);

    fireEvent.click(screen.getByRole('button', { name: /2\. Structure/ }));
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(/Choose a product/);
    expect(document.activeElement).toBe(heading);

    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/client mandate/i);
  });

  it('opens and closes the Runs window, removing it on Escape', async () => {
    render(<App startOnDesk />);
    fireEvent.click(screen.getByRole('button', { name: /^Runs/ }));
    expect(screen.getByRole('dialog', { name: /session runs/i })).toBeTruthy();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
