import {
  HttpException,
  Injectable,
  ServiceUnavailableException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { CommandBusService } from "src/common/rabbitMQ/command-bus.service";
import { EXCHANGES, ROUTING_KEYS } from "src/common/rabbitMQ/rabbitmq-topology";
import { RecommendationService } from "../recommendations/recommendations.service";
import { ShortageTracker } from '../recommendations/shortage-tracker';

interface Sale { dishId: number; quantity: number; revenue: number | null }
interface OrderPeriod {
  days: number; timezone: string; from: string; to: string;
  summary: { revenue: number | null; orders: number; completed: number };
  points: Array<{ date: string; label: string; revenue: number | null; orders: number; dishes: Sale[] }>;
}
interface CatalogDish { id: number; costPrice: number | null; salePrice?: number | null; availablePortions: number }
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class StatisticsService {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly commandBusService: CommandBusService,
    private readonly shortageTracker: ShortageTracker,
  ) {}

  private validateDays(days: number) {
    if (![7, 14, 30].includes(days)) throw new BadRequestException('Допустимые периоды: 7, 14, 30 дней');
  }

  private async periodData(days: number): Promise<[OrderPeriod, CatalogDish[]]> {
    this.validateDays(days);
    const [orders, catalog] = await Promise.all([
      this.commandBusService.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_ORDER_PERIOD_STATISTICS, { days }) as Promise<any>,
      this.commandBusService.sendCommand(EXCHANGES.COMMANDS, ROUTING_KEYS.GET_DISHES, {}) as Promise<any>,
    ]).catch(() => { throw new ServiceUnavailableException('Не удалось получить статистику заказов или каталог'); });
    for (const response of [orders, catalog]) {
      if (!response?.success) throw new HttpException(response?.error?.message ?? 'Статистика недоступна', response?.error?.status ?? 502);
    }
    return [orders.data, catalog.data];
  }

  private cost(sales: Sale[], catalog: CatalogDish[]) {
    let total = 0;
    for (const sale of sales) {
      const cost = catalog.find(d => d.id === sale.dishId)?.costPrice;
      if (cost == null || !Number.isFinite(cost)) return null;
      total += cost * sale.quantity;
    }
    return round(total);
  }

  async getDashboardStatistics(days = 14) {
    const [orders, catalog] = await this.periodData(days);
    const points = orders.points.map(point => {
      const cost = this.cost(point.dishes, catalog);
      return { date: point.date, label: point.label, revenue: point.revenue, orders: point.orders,
        earning: point.revenue == null || cost == null ? null : round(point.revenue - cost) };
    });
    return { days, timezone: orders.timezone, from: orders.from, to: orders.to, points,
      summary: { ...orders.summary,
        earning: points.some(p => p.earning == null) ? null : round(points.reduce((sum, p) => sum + p.earning!, 0)),
        averageCheck: orders.summary.revenue == null ? null : orders.summary.completed
          ? round(orders.summary.revenue / orders.summary.completed) : 0 } };
  }

  async getDishDetailsStatistics(id: number, days = 7) {
    if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Некорректный ID блюда');
    const [orders, catalog] = await this.periodData(days);
    const dish = catalog.find(d => d.id === id);
    if (!dish) throw new NotFoundException('Блюдо не найдено');
    const statuses = await this.recommendationService.getDishStatuses();
    const status = statuses.find(d => d.dishId === id);
    const sales = orders.points.map(point => {
      const sale = point.dishes.find(d => d.dishId === id);
      return { date: point.date, label: point.label, quantity: sale?.quantity ?? 0, revenue: sale ? sale.revenue : 0 };
    });
    const quantities = new Map<number, number>();
    for (const point of orders.points) for (const sale of point.dishes) quantities.set(sale.dishId, (quantities.get(sale.dishId) ?? 0) + sale.quantity);
    const quantity = sales.reduce((n, s) => n + s.quantity, 0);
    const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    const revenue = sales.some(s => s.revenue == null) ? null : round(sales.reduce((n, s) => n + s.revenue!, 0));
    const ingredientCost = quantity === 0 ? 0 : dish.costPrice == null ? null : round(dish.costPrice * quantity);
    const costPrice = dish.costPrice ?? null;
    const profit = dish.salePrice == null || costPrice == null ? null : round(dish.salePrice - costPrice);
    return { dishId: id, today: sales.find(s => s.date === today)?.quantity ?? 0, week: quantity,
      popularity: quantity ? 1 + [...quantities.values()].filter(q => q > quantity).length : null,
      sales, revenue, ingredientCost, earning: revenue == null || ingredientCost == null ? null : round(revenue - ingredientCost),
      availablePortions: status?.maxPortions ?? dish.availablePortions, status: status?.status ?? 'STOP_LIST',
      costPrice, profit, markup: costPrice == null || costPrice <= 0 || profit == null ? null : round(profit / costPrice * 100) };
  }

  async getShortageStatistics(days = 14) {
    this.validateDays(days);
    await this.recommendationService.getDishStatuses();
    return this.shortageTracker.statistics(days);
  }

  async getDishesStatistics(forceRefresh = false) {
    const dishes = await this.recommendationService.getDishStatuses(forceRefresh);

    return {
      total: dishes.length,
      active: dishes.filter((dish) => dish.status === "AVAILABLE").length,
      lowStock: dishes.filter((dish) => dish.status === "LOW_STOCK").length,
      stopList: dishes.filter((dish) => dish.status === "STOP_LIST").length,
    };
  }

  async getOrdersTodayStatistics() {
    let response: any;

    try {
      response = await this.commandBusService.sendCommand(
        EXCHANGES.COMMANDS,
        ROUTING_KEYS.GET_ORDERS_TODAY_STATISTICS,
        {},
      );
    } catch {
      throw new ServiceUnavailableException(
        "Сервис заказов недоступен. Повторите попытку",
      );
    }

    if (!response?.success) {
      throw new HttpException(
        response?.error?.message ?? "Сервис заказов недоступен",
        response?.error?.status ?? 502,
      );
    }

    return response.data;
  }
}
