import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AdminSelectionCheckbox } from '../Front/src/components/AdminSelectionCheckbox.tsx';
import { toggleAdminProfileSelection } from '../Front/src/lib/adminProfileCity.ts';

test('single profile checkbox toggles the stable ID without duplicates and stops row click propagation', () => {
  let selectedIds: string[] = [];
  let rowOpened = false;

  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    selectedIds = selected;
    return React.createElement('div', { onClick: () => { rowOpened = true; } },
      React.createElement(AdminSelectionCheckbox, {
        checked: selected.includes('profile-a'),
        onChange: () => setSelected((current) => toggleAdminProfileSelection(current, 'profile-a')),
        ariaLabel: 'toggle profile',
        label: 'profile-a'
      }));
  }

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Harness));
  });
  const input = renderer!.root.findByType('input');
  const clickEvent = {
    stopped: false,
    stopPropagation() { this.stopped = true; }
  };

  act(() => {
    input.props.onClick(clickEvent);
    input.props.onChange({ currentTarget: { checked: true } });
  });
  assert.equal(clickEvent.stopped, true);
  assert.equal(rowOpened, false);
  assert.deepEqual(selectedIds, ['profile-a']);

  act(() => {
    renderer!.root.findByType('input').props.onChange({ currentTarget: { checked: false } });
  });
  assert.deepEqual(selectedIds, []);

  act(() => {
    renderer!.unmount();
  });
});

test('range checkbox sets the native indeterminate property and supports checked and unchecked states', () => {
  const inputNode = { indeterminate: false };
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(React.createElement(AdminSelectionCheckbox, {
      checked: false,
      indeterminate: true,
      onChange() {},
      label: 'range'
    }), {
      createNodeMock: (element) => element.type === 'input' ? inputNode : null
    });
  });
  assert.equal(renderer!.root.findByType('input').props.checked, false);
  assert.equal(inputNode.indeterminate, true);

  act(() => {
    renderer!.update(React.createElement(AdminSelectionCheckbox, {
      checked: true,
      indeterminate: false,
      onChange() {},
      label: 'range'
    }));
  });
  assert.equal(renderer!.root.findByType('input').props.checked, true);
  assert.equal(inputNode.indeterminate, false);

  act(() => {
    renderer!.update(React.createElement(AdminSelectionCheckbox, {
      checked: false,
      indeterminate: false,
      onChange() {},
      label: 'range'
    }));
  });
  assert.equal(renderer!.root.findByType('input').props.checked, false);
  assert.equal(inputNode.indeterminate, false);

  act(() => {
    renderer!.unmount();
  });
});
