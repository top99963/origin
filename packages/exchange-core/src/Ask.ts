import { IDeviceTypeService, ILocationService } from '@energyweb/utils-general';
import BN from 'bn.js';

import { Bid } from './Bid';
import { Order, OrderSide, OrderStatus } from './Order';
import { Product } from './Product';
import { ProductFilter, Filter } from './ProductFilter';

export class Ask extends Order {
    constructor(
        id: string,
        price: number,
        volume: BN,
        product: Product,
        validFrom: Date,
        status: OrderStatus,
        userId: string
    ) {
        super(id, OrderSide.Ask, status, validFrom, product, price, volume, userId);

        if (product.deviceType?.length !== 1) {
            throw new Error('Unable to create ask order. DeviceType has to be specified');
        }
    }

    public filterBy(
        productFilter: ProductFilter,
        deviceService: IDeviceTypeService,
        locationService: ILocationService
    ): boolean {
        const hasMatchingDeviceType = this.filterByMatchingDeviceType(productFilter, deviceService);
        const hasMatchingVintage = this.hasMatchingVintage(productFilter);
        const hasMatchingLocation = this.filterByMatchingLocation(productFilter, locationService);

        return hasMatchingDeviceType && hasMatchingVintage && hasMatchingLocation;
    }

    public matches(
        bid: Bid,
        deviceService: IDeviceTypeService,
        locationService: ILocationService
    ): boolean {
        const { product } = bid;

        const hasMatchingDeviceType = this.hasMatchingDeviceType(product, deviceService);
        const hasMatchingVintage = this.hasMatchingVintage(product);
        const hasMatchingLocation = this.hasMatchingLocation(product, locationService);

        return hasMatchingDeviceType && hasMatchingVintage && hasMatchingLocation;
    }

    public clone() {
        return new Ask(
            this.id,
            this.price,
            this.volume,
            this.product,
            this.validFrom,
            this.status,
            this.userId
        );
    }

    private filterByMatchingDeviceType(
        productFilter: ProductFilter,
        deviceService: IDeviceTypeService
    ) {
        if (
            productFilter.deviceTypeFilter === Filter.All ||
            productFilter.deviceTypeFilter === Filter.Unspecified
        ) {
            return true;
        }

        return deviceService.includesDeviceType(
            this.product.deviceType[0],
            productFilter.deviceType
        );
    }

    private filterByMatchingLocation(
        productFilter: ProductFilter,
        locationService: ILocationService
    ) {
        if (
            productFilter.locationFilter === Filter.All ||
            productFilter.locationFilter === Filter.Unspecified
        ) {
            return true;
        }

        return locationService.matches(productFilter.location, this.product.location[0]);
    }

    private hasMatchingDeviceType(product: Product, deviceService: IDeviceTypeService) {
        if (!product.deviceType?.length) {
            return true;
        }

        return deviceService.includesDeviceType(this.product.deviceType[0], product.deviceType);
    }

    private hasMatchingVintage(product: Product) {
        if (!product.deviceVintage || !this.product.deviceVintage) {
            return true;
        }
        return this.product.deviceVintage.matches(product.deviceVintage);
    }

    private hasMatchingLocation(product: Product, locationService: ILocationService) {
        if (!product.location?.length) {
            return true;
        }

        return locationService.matches(product.location, this.product.location[0]);
    }
}
