import { OrderSide, OrderStatus } from '@energyweb/exchange-core';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import BN from 'bn.js';
import { Repository } from 'typeorm';

import { AccountBalanceService } from '../account-balance/account-balance.service';
import { AssetService } from '../asset/asset.service';
import { MatchingEngineService } from '../matching-engine/matching-engine.service';
import { ProductService } from '../product/product.service';
import { CreateAskDTO } from './create-ask.dto';
import { CreateBidDTO } from './create-bid.dto';
import { Order } from './order.entity';
import { OrderType } from './order-type.enum';
import { DirectBuyDTO } from './direct-buy.dto';

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);

    constructor(
        @InjectRepository(Order, 'ExchangeConnection')
        private readonly repository: Repository<Order>,
        private readonly matchingEngineService: MatchingEngineService,
        @Inject(forwardRef(() => AccountBalanceService))
        private readonly accountBalanceService: AccountBalanceService,
        private readonly productService: ProductService,
        private readonly assetService: AssetService
    ) {}

    public async createBid(userId: string, bid: CreateBidDTO): Promise<Order> {
        this.logger.debug(`Requested bid creation for user:${userId} bid:${JSON.stringify(bid)}`);

        const order = await this.repository.save({
            userId,
            validFrom: new Date(bid.validFrom),
            side: OrderSide.Bid,
            status: OrderStatus.Active,
            startVolume: new BN(bid.volume),
            currentVolume: new BN(bid.volume),
            price: bid.price,
            product: bid.product
        });

        this.matchingEngineService.submit(order);

        return order;
    }

    public async createDemandBid(
        userId: string,
        bid: CreateBidDTO,
        demandId: string
    ): Promise<Order> {
        this.logger.debug(
            `Requested demand bid creation for user:${userId} bid:${JSON.stringify(bid)}`
        );

        return this.repository.save({
            userId,
            validFrom: new Date(bid.validFrom),
            side: OrderSide.Bid,
            status: OrderStatus.Active,
            startVolume: new BN(bid.volume),
            currentVolume: new BN(bid.volume),
            price: bid.price,
            product: bid.product,
            demand: { id: demandId }
        });
    }

    public async createAsk(userId: string, ask: CreateAskDTO): Promise<Order> {
        this.logger.debug(`Requested ask creation for user:${userId} ask:${JSON.stringify(ask)}`);

        if (
            !(await this.accountBalanceService.hasEnoughAssetAmount(
                userId,
                ask.assetId,
                ask.volume.toString()
            ))
        ) {
            throw new Error('Not enough assets');
        }

        const { deviceId } = await this.assetService.get(ask.assetId);
        const product = this.productService.getProduct(deviceId);

        const order = await this.repository.save({
            userId,
            validFrom: new Date(ask.validFrom),
            product,
            side: OrderSide.Ask,
            status: OrderStatus.Active,
            startVolume: new BN(ask.volume),
            currentVolume: new BN(ask.volume),
            asset: { id: ask.assetId },
            price: ask.price
        });

        this.matchingEngineService.submit(order);

        return order;
    }

    public async createDirectBuy(userId: string, buyAsk: DirectBuyDTO) {
        const ask = await this.repository.findOne(buyAsk.askId, { where: { side: OrderSide.Ask } });
        if (!ask || ask.userId === userId) {
            throw new Error('Ask does not exist or owned by the user');
        }

        const order = await this.repository.save({
            userId,
            validFrom: new Date(),
            side: OrderSide.Bid,
            status: OrderStatus.Active,
            type: OrderType.Direct,
            startVolume: new BN(buyAsk.volume),
            currentVolume: new BN(buyAsk.volume),
            price: buyAsk.price,
            directBuyId: buyAsk.askId,
            product: {}
        });

        this.matchingEngineService.submit(order);

        return order;
    }

    public async submit(order: Order) {
        this.logger.debug(`Submitting order:${JSON.stringify(order)}`);

        this.matchingEngineService.submit(order);
    }

    public async getAllOrders(userId: string) {
        return this.repository.find({
            where: { userId }
        });
    }

    public async getAllActiveOrders() {
        return this.repository.find({
            where: [{ status: OrderStatus.Active }, { status: OrderStatus.PartiallyFilled }]
        });
    }

    public async getActiveOrders(userId: string) {
        return this.repository.find({
            where: [
                { status: OrderStatus.Active, userId },
                { status: OrderStatus.PartiallyFilled, userId }
            ]
        });
    }

    public async getActiveOrdersBySide(userId: string, side: OrderSide) {
        return this.repository.find({
            where: [
                { status: OrderStatus.Active, userId, side },
                { status: OrderStatus.PartiallyFilled, userId, side }
            ]
        });
    }
}
