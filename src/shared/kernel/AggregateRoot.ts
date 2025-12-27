import { Entity } from './Entity';

export abstract class AggregateRoot<T> extends Entity<T> {
  private domainEvents: any[] = [];

  get events(): any[] {
    return this.domainEvents;
  }

  protected addDomainEvent(event: any): void {
    this.domainEvents.push(event);
  }

  public clearEvents(): void {
    this.domainEvents = [];
  }
}
