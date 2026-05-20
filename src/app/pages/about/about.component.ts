import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent implements AfterViewInit, OnDestroy {
  private observer?: IntersectionObserver;

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          // Once visible, stop observing (one-shot entrance)
          this.observer?.unobserve(e.target);
        }
      }),
      { threshold: 0.10, rootMargin: '0px 0px -40px 0px' }
    );

    // Observe fade-up text blocks + sketch illustration
    document.querySelectorAll(
      '.ab2-fade-up, .ab2-sketch-anim'
    ).forEach(el => this.observer!.observe(el));
  }

  ngOnDestroy() { this.observer?.disconnect(); }
}