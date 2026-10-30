import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DashHandle } from './handle.directive';
import { DashWidget } from './widget.directive';

@Component({
  imports: [DashWidget, DashHandle],
  template: `<div class="w" [dashWidget]="id()"><span class="h" dashHandle>h</span></div>`,
})
class Host {
  readonly id = signal('a');
}

describe('dashWidget and dashHandle', () => {
  it('sets data-grid-id and follows the input', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector('.w');
    expect(el.getAttribute('data-grid-id')).toBe('a');
    fixture.componentInstance.id.set('b');
    fixture.detectChanges();
    expect(el.getAttribute('data-grid-id')).toBe('b');
  });

  it('marks the handle with data-grid-handle', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const h: HTMLElement = fixture.nativeElement.querySelector('.h');
    expect(h.getAttribute('data-grid-handle')).toBe('');
  });
});
