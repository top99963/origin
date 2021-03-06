import React, { useState, useEffect } from 'react';
import moment from 'moment';
import { Contracts as MarketContracts, PurchasableCertificate } from '@energyweb/market';

import { ProducingDevice } from '@energyweb/device-registry';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    FormControl,
    InputLabel,
    FilledInput,
    MenuItem,
    Select
} from '@material-ui/core';
import { showNotification, NotificationType } from '../../utils/notifications';
import { useSelector, useDispatch } from 'react-redux';
import { getConfiguration } from '../../features/selectors';
import { getCurrencies } from '../../features/general/selectors';
import { setLoading } from '../../features/general/actions';
import { countDecimals } from '../../utils/helper';
import { formatDate } from '../../utils/time';
import { EnergyFormatter } from '../../utils/EnergyFormatter';

interface IProps {
    certificate: PurchasableCertificate.Entity;
    producingDevice: ProducingDevice.Entity;
    showModal: boolean;
    callback: () => void;
}

const ERC20CURRENCY = 'ERC20 Token';

const DEFAULT_ENERGY_IN_BASE_UNIT = 1;

export function PublishForSaleModal(props: IProps) {
    const { certificate, callback, producingDevice, showModal } = props;

    const availableCurrencies = useSelector(getCurrencies);

    const configuration = useSelector(getConfiguration);

    const [energyInDisplayUnit, setEnergyInDisplayUnit] = useState(
        EnergyFormatter.getValueInDisplayUnit(DEFAULT_ENERGY_IN_BASE_UNIT)
    );

    const energyInBaseUnit = EnergyFormatter.getBaseValueFromValueInDisplayUnit(
        energyInDisplayUnit
    );
    const [price, setPrice] = useState(1);
    const [currency, setCurrency] = useState(availableCurrencies[0]);
    const [erc20TokenAddress, setErc20TokenAddress] = useState('');
    const [validation, setValidation] = useState({
        energyInDisplayUnit: true,
        price: true,
        erc20TokenAddress: false
    });

    const dispatch = useDispatch();

    useEffect(() => {
        if (certificate) {
            setEnergyInDisplayUnit(
                EnergyFormatter.getValueInDisplayUnit(certificate.certificate.energy)
            );
        }
    }, [certificate]);

    const isErc20Sale = currency === ERC20CURRENCY;

    const isFormValid = isErc20Sale
        ? Object.keys(validation).every(property => validation[property] === true)
        : validation.energyInDisplayUnit && validation.price;

    function handleClose() {
        callback();
    }

    async function publishForSale() {
        if (!isFormValid) {
            return;
        }

        if (certificate.forSale) {
            handleClose();
            showNotification(
                `Certificate ${certificate.id} has already been published for sale.`,
                NotificationType.Error
            );

            return;
        }

        dispatch(setLoading(true));
        await certificate.publishForSale(
            price * 100,
            isErc20Sale ? erc20TokenAddress : currency,
            energyInBaseUnit
        );

        showNotification(`Certificate has been published for sale.`, NotificationType.Success);
        dispatch(setLoading(false));
        handleClose();
    }

    async function validateInputs(event) {
        switch (event.target.id) {
            case 'energyInDisplayUnitInput':
                const newEnergyInDisplayUnit = Number(event.target.value);
                const newEnergyInBaseValueUnit = EnergyFormatter.getBaseValueFromValueInDisplayUnit(
                    newEnergyInDisplayUnit
                );

                const energyInDisplayUnitValid =
                    !isNaN(energyInDisplayUnit) &&
                    newEnergyInBaseValueUnit >= 1 &&
                    newEnergyInBaseValueUnit <= certificate.certificate.energy &&
                    countDecimals(newEnergyInDisplayUnit) <= 6;

                setEnergyInDisplayUnit(newEnergyInDisplayUnit);

                setValidation({
                    ...validation,
                    energyInDisplayUnit: energyInDisplayUnitValid
                });
                break;
            case 'priceInput':
                const newPrice = Number(event.target.value);
                const priceValid =
                    !isNaN(newPrice) &&
                    newPrice > 0 &&
                    countDecimals(newPrice) <= (isErc20Sale ? 0 : 2);

                setPrice(event.target.value);
                setValidation({
                    ...validation,
                    price: priceValid
                });
                break;
            case 'tokenAddressInput':
                const givenAddress = event.target.value;
                const isAddress = configuration.blockchainProperties.web3.utils.isAddress(
                    givenAddress
                );
                let isInitializedToken = true;

                if (isAddress) {
                    const token = new MarketContracts.Erc20TestToken(
                        configuration.blockchainProperties.web3,
                        givenAddress
                    );

                    try {
                        await token.web3Contract.methods.symbol().call();
                    } catch (e) {
                        isInitializedToken = false;
                    }
                }

                setErc20TokenAddress(givenAddress);
                setValidation({
                    ...validation,
                    erc20TokenAddress: isAddress && isInitializedToken
                });
                break;
        }
    }

    const certificateId = certificate ? certificate.id : '';
    const facilityName = producingDevice ? producingDevice.offChainProperties.facilityName : '';

    let creationTime: string;

    try {
        creationTime =
            certificate && formatDate(moment.unix(certificate.certificate.creationTime), true);
    } catch (error) {
        console.error('Error in PublishForSaleModal', error);
    }

    return (
        <Dialog open={showModal} onClose={handleClose}>
            <DialogTitle>{`Publish certificate #${certificateId} for sale`}</DialogTitle>
            <DialogContent>
                <TextField label="Facility" value={facilityName} fullWidth disabled />

                {creationTime && (
                    <>
                        <TextField
                            label="Creation time"
                            value={creationTime}
                            fullWidth
                            disabled
                            className="mt-4"
                        />
                    </>
                )}

                <TextField
                    label={EnergyFormatter.displayUnit}
                    value={energyInDisplayUnit}
                    type="number"
                    placeholder="1"
                    onChange={e => validateInputs(e)}
                    className="mt-4"
                    id="energyInDisplayUnitInput"
                    fullWidth
                />

                <TextField
                    label="Price"
                    value={price}
                    type="number"
                    placeholder="1"
                    onChange={e => validateInputs(e)}
                    className="mt-4"
                    id="priceInput"
                    fullWidth
                />

                <FormControl fullWidth={true} variant="filled" className="mt-4">
                    <InputLabel>Currency</InputLabel>
                    <Select
                        value={currency}
                        onChange={e => setCurrency(e.target.value as string)}
                        fullWidth
                        variant="filled"
                        input={<FilledInput />}
                    >
                        {availableCurrencies.map(item => (
                            <MenuItem key={item} value={item}>
                                {item}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {isErc20Sale && (
                    <TextField
                        label="ERC20 Token Address"
                        value={erc20TokenAddress}
                        placeholder="<ERC20 Token Address>"
                        onChange={e => validateInputs(e)}
                        className="mt-4"
                        id="tokenAddressInput"
                        fullWidth
                    />
                )}

                <div className="text-danger">
                    {!validation.price && <div>Price is invalid</div>}
                    {!validation.energyInDisplayUnit && (
                        <div>{EnergyFormatter.displayUnit} value is invalid</div>
                    )}
                    {isErc20Sale && !validation.erc20TokenAddress && (
                        <div>Token address is invalid</div>
                    )}
                </div>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} color="secondary">
                    Cancel
                </Button>
                <Button onClick={publishForSale} color="primary" disabled={!isFormValid}>
                    Publish for sale
                </Button>
            </DialogActions>
        </Dialog>
    );
}
