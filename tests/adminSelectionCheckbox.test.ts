import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AdminSelectionCheckbox } from '../Front/src/components/AdminSelectionCheckbox.tsx';
import { toggleAdminProfileSelection } from '../Front/src/lib/adminProfileCity.ts';
import { adminProfileSelectionCount, emptyAdminProfileSelection, selectAllFilteredProfiles } from '../Front/src/lib/adminProfileSelection.ts';
import type { AdminProfileSelection, AdminProfileSelectionFilters } from '../Front/src/lib/adminProfileSelection.ts';

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

test('main checkbox selects all 1369 backend-counted results while country panels stay collapsed', () => {
  const filters: AdminProfileSelectionFilters = {
    q: '', type: 'all', published: 'all', suspended: 'all', seed: 'all',
    verified: 'all', premium_tier: 'all', owner_email: '', city_query: '', country: '', city: ''
  };
  let selection: AdminProfileSelection = emptyAdminProfileSelection;

  function Harness() {
    const [current, setCurrent] = useState<AdminProfileSelection>(emptyAdminProfileSelection);
    selection = current;
    const count = adminProfileSelectionCount(current);
    return React.createElement(AdminSelectionCheckbox, {
      checked: count === 1369,
      indeterminate: count > 0 && count < 1369,
      onChange: (checked) => setCurrent(checked ? selectAllFilteredProfiles(filters, 1369) : emptyAdminProfileSelection),
      label: `Select all results (1369); selected ${count}`
    });
  }

  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Harness));
  });
  assert.equal(renderer!.root.findAllByProps({ 'data-country-panel': true }).length, 0);
  act(() => {
    renderer!.root.findByType('input').props.onChange({ currentTarget: { checked: true } });
  });
  assert.equal(selection.mode, 'all_filtered');
  assert.equal(adminProfileSelectionCount(selection), 1369);
  assert.equal(renderer!.root.findByType('input').props.checked, true);

  act(() => {
    renderer!.root.findByType('input').props.onChange({ currentTarget: { checked: false } });
  });
  assert.deepEqual(selection, emptyAdminProfileSelection);
  act(() => renderer!.unmount());
});
