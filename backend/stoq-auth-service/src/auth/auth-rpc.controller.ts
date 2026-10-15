import { RabbitRPC } from "@golevelup/nestjs-rabbitmq";
import {
  BadRequestException,
  Injectable,
  ValidationPipe,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "../common/rabbitMQ/rabbitmq-topology";
import { executeRpc } from "../common/utils/rpc-handler";
import { RegisterUserDto } from "./dto/register-user.dto";
import { RegisterRestaurantDto } from "./dto/register-restaurant.dto";
import { LoginDto } from "./dto/login.dto";
import { ApproveUserDto } from "./dto/approve-user.dto";
import { UpdateRestaurantDto } from "./dto/update-restaurant.dto";

const rpc = (routingKey: string) =>
  RabbitRPC({
    exchange: EXCHANGES.COMMANDS,
    queue: QUEUES.AUTH_COMMANDS,
    routingKey,
  });

@Injectable()
export class AuthRPCController {
  private readonly validation = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  constructor(private readonly auth: AuthService) {}

  @rpc(ROUTING_KEYS.AUTH_GET_RESTAURANTS)
  restaurants() {
    return executeRpc(() => this.auth.getRestaurants());
  }

  @rpc(ROUTING_KEYS.AUTH_GET_RESTAURANT)
  restaurant(payload: { id: number }) {
    return executeRpc(() => this.auth.getRestaurant(payload?.id));
  }

  private dto<T>(metatype: new () => T, value: unknown): Promise<T> {
    return this.validation.transform(value, { type: "body", metatype });
  }

  private employeeId(id: number) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new BadRequestException("Некорректный ID сотрудника");
    return id;
  }

  @rpc(ROUTING_KEYS.AUTH_REGISTER_USER)
  registerUser(payload: { dto: RegisterUserDto }) {
    return executeRpc(async () =>
      this.auth.registerUser(await this.dto(RegisterUserDto, payload?.dto)),
    );
  }

  @rpc(ROUTING_KEYS.AUTH_REGISTER_RESTAURANT)
  registerRestaurant(payload: { dto: RegisterRestaurantDto }) {
    return executeRpc(async () =>
      this.auth.registerRestaurant(
        await this.dto(RegisterRestaurantDto, payload?.dto),
      ),
    );
  }

  @rpc(ROUTING_KEYS.AUTH_LOGIN)
  login(payload: { dto: LoginDto }) {
    return executeRpc(async () =>
      this.auth.login(await this.dto(LoginDto, payload?.dto)),
    );
  }

  @rpc(ROUTING_KEYS.AUTH_VERIFY_ACCESS)
  verifyAccess(payload: { accessToken: string }) {
    return executeRpc(() => this.auth.verifyAccessToken(payload?.accessToken));
  }

  @rpc(ROUTING_KEYS.AUTH_REFRESH)
  refresh(payload: { refreshToken: string }) {
    return executeRpc(() => this.auth.refreshByToken(payload?.refreshToken));
  }

  @rpc(ROUTING_KEYS.AUTH_LOGOUT)
  logout(payload: { accessToken: string }) {
    return executeRpc(async () =>
      this.auth.logout(
        (await this.auth.verifyAccessToken(payload?.accessToken)).id,
      ),
    );
  }

  @rpc(ROUTING_KEYS.AUTH_PENDING_USERS)
  pending(payload: { accessToken: string }) {
    return executeRpc(async () =>
      this.auth.getPendingUsers(
        (await this.auth.verifyAccessToken(payload?.accessToken)).id,
      ),
    );
  }

  @rpc(ROUTING_KEYS.AUTH_APPROVE_USER)
  approve(payload: { accessToken: string; id: number; dto: ApproveUserDto }) {
    return executeRpc(async () =>
      this.auth.approveUser(
        (await this.auth.verifyAccessToken(payload?.accessToken)).id,
        this.employeeId(payload.id),
        await this.dto(ApproveUserDto, payload.dto),
      ),
    );
  }

  @rpc(ROUTING_KEYS.AUTH_DELETE_USER)
  delete(payload: { accessToken: string; id: number }) {
    return executeRpc(async () =>
      this.auth.deleteUser(
        (await this.auth.verifyAccessToken(payload?.accessToken)).id,
        this.employeeId(payload.id),
      ),
    );
  }

  @rpc(ROUTING_KEYS.AUTH_UPDATE_RESTAURANT)
  updateRestaurant(payload: { accessToken: string; dto: UpdateRestaurantDto }) {
    return executeRpc(async () =>
      this.auth.updateRestaurant(
        (await this.auth.verifyAccessToken(payload?.accessToken)).id,
        await this.dto(UpdateRestaurantDto, payload.dto),
      ),
    );
  }
}
