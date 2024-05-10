import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CarViewerComponent } from './car-viewer/car-viewer.component';

const routes: Routes = [
  { path: '**', redirectTo: '/align' },
  { path: 'align', component: CarViewerComponent },

];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
