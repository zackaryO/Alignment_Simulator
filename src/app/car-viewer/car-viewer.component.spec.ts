import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CarViewerComponent } from './car-viewer.component';

describe('CarViewerComponent', () => {
  let component: CarViewerComponent;
  let fixture: ComponentFixture<CarViewerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CarViewerComponent]
    });
    fixture = TestBed.createComponent(CarViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
