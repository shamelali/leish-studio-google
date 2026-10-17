/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  X,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Car,
  Sparkles,
  Calculator
} from 'lucide-react';
import { Salon, Service, StaffMember, Booking, User, LookbookItem } from '../types';
import { apiClient, useCreateBooking, bookingsApi } from '../lib/api';
import {
  bookingFormSchema, bookingTimeSlots, bookingTravelQuoteSchema, buildBookingRequest,
  formatBookingDate, getBookingDates, getBookingScheduleErrors, getBookingTravelFee,
  type BookingFormData, type BookingRequest, type BookingTravelQuote,
} from '../lib/booking';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  salon: Salon;
  service: Service;
  currentUser: User | null;
  onBookingSuccess: (booking: Booking) => void;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
  attachedMoodboard?: LookbookItem | null;
}

export default function BookingModal({
  isOpen,
  onClose,
  salon,
  service,
  currentUser,
  onBookingSuccess,
  onOpenAuth,
  attachedMoodboard
}: BookingModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(salon.staff[0] || null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [calculatingTravel, setCalculatingTravel] = useState<boolean>(false);
  const [travelQuote, setTravelQuote] = useState<BookingTravelQuote | null>(null);
  const [travelError, setTravelError] = useState<string | null>(null);
  const [receivedBooking, setReceivedBooking] = useState<Booking | null>(null);
  const [reviewedRequest, setReviewedRequest] = useState<BookingRequest | null>(null);
  const [scheduleErrors, setScheduleErrors] = useState<{ staff?: string; date?: string; time?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errorFocusVersion, setErrorFocusVersion] = useState(0);
  // Payment state (Hitpay)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid' | 'failed' | null>(null);
  const [paymentBillId, setPaymentBillId] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  // Guest email verification (FR-001): appears when the API answers
  // 422 contact_unverified; a code is requested automatically, the guest
  // enters it, and the next submit carries it as contactCode.
  const [verificationNeeded, setVerificationNeeded] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const travelRequest = useRef(0);
  const id = useId();
  const fieldId = (field: string) => `${id}-${field}`;
  const reducedMotion = useReducedMotion();

  const { register, handleSubmit, getValues, watch, setValue, setError, clearErrors, formState: { errors }, reset } = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    shouldFocusError: false,
    defaultValues: {
      clientName: currentUser?.name || '',
      clientEmail: currentUser?.email || '',
      clientPhone: currentUser?.phone || '',
      notes: '',
      isLocationEvent: false,
      eventVenue: '',
    },
  });
  const isLocationEvent = watch('isLocationEvent');
  const eventVenue = watch('eventVenue');

  const createBooking = useCreateBooking();

  React.useEffect(() => {
    if (currentUser) {
      reset({
        ...getValues(),
        clientName: currentUser.name,
        clientEmail: currentUser.email,
        clientPhone: currentUser.phone || getValues('clientPhone'),
      });
    }
  }, [currentUser, getValues, reset]);

  React.useEffect(() => {
    if (attachedMoodboard) {
      reset({
        ...getValues(),
        notes: `[Attached Lookbook: "${attachedMoodboard.lookName}"]\nLip: ${attachedMoodboard.lipFormula.shade}\nComplexion: ${attachedMoodboard.complexion.finish}`,
      });
    }
  }, [attachedMoodboard, getValues, reset]);

  React.useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    return () => {
      travelRequest.current += 1;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (isOpen) {
      titleRef.current?.focus();
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
  }, [isOpen, step]);

  React.useEffect(() => {
    if (isOpen && errorFocusVersion) errorSummaryRef.current?.focus();
  }, [isOpen, errorFocusVersion]);

  if (!isOpen) return null;

  const focusErrors = () => setErrorFocusVersion(version => version + 1);
  const closeBooking = () => {
    if (!submitting.current) onClose();
  };

  const invalidateTravelQuote = () => {
    travelRequest.current += 1;
    setTravelQuote(null);
    setTravelError(null);
    setCalculatingTravel(false);
  };

  const handleEstimateTravel = async () => {
    const venue = eventVenue.trim();
    if (!venue || venue.length > 200) {
      setError('eventVenue', { message: !venue
        ? 'Enter the venue or hotel address before calculating travel.'
        : 'Keep the venue address to 200 characters or fewer.' });
      focusErrors();
      return;
    }
    clearErrors('eventVenue');
    setTravelError(null);
    const request = ++travelRequest.current;
    setCalculatingTravel(true);
    try {
      const data = await apiClient.post('/venue/estimate-travel', { salonId: salon.id, venue });
      const quote = bookingTravelQuoteSchema.parse(data);
      if (request === travelRequest.current) setTravelQuote(quote);
    } catch {
      if (request === travelRequest.current) {
        setTravelQuote(null);
        setTravelError('We could not estimate travel. Check the venue address and try again, or continue with the provisional RM50 kit fee. Mileage is still to be confirmed by the studio.');
      }
    } finally {
      if (request === travelRequest.current) setCalculatingTravel(false);
    }
  };

  const validateSchedule = () => {
    const nextErrors = {
      ...getBookingScheduleErrors(selectedDate, selectedTime, salon.workingHours),
      staff: !selectedStaff || !salon.staff.some(staff => staff.id === selectedStaff.id)
        ? 'Choose a listed specialist. If none are listed, contact the studio to arrange an appointment.' : undefined,
    };
    setScheduleErrors(nextErrors);
    if (nextErrors.staff || nextErrors.date || nextErrors.time) {
      setStep(1);
      focusErrors();
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateSchedule()) setStep(2);
  };

  const onReview = (data: BookingFormData) => {
    if (calculatingTravel || !validateSchedule() || !selectedStaff) return;
    setReviewedRequest(buildBookingRequest(data, {
      salon, service, staffId: selectedStaff.id, date: selectedDate, time: selectedTime,
      travelQuote, attachedMoodboard,
    }));
    setSubmitError(null);
    setStep(3);
  };

  const requestVerificationCode = async (email: string, resend = false) => {
    if (!email) return false;
    setVerificationBusy(true);
    try {
      await apiClient.post('/bookings/verify-request', { contact: email });
      setVerificationSent(true);
      setSubmitError(resend ? null : 'Enter the six-digit code we just emailed you to confirm your address.');
      return true;
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'We could not send a verification email. Try again shortly.');
      return false;
    } finally {
      setVerificationBusy(false);
    }
  };

  const onSubmit = async () => {
    if (step !== 3 || !reviewedRequest || submitting.current || !validateSchedule()) return;
    submitting.current = true;
    setSubmitError(null);
    let result: Booking;
    try {
      result = await createBooking.mutateAsync({
        ...reviewedRequest,
        contactCode: verificationCode.trim() ? verificationCode.trim() : undefined,
      } as BookingRequest);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'contact_unverified' || code === 'invalid_contact') {
        setVerificationNeeded(true);
        if (!verificationSent) {
          const email = (reviewedRequest as { clientEmail?: string }).clientEmail ?? '';
          void requestVerificationCode(email);
        } else {
          setSubmitError('Enter the six-digit verification code we emailed you, then try again.');
        }
      } else if (code === 'invalid_token') {
        setSubmitError(`${error instanceof Error ? error.message : 'Your session has expired.'}`);
      } else {
        setSubmitError(`We couldn't send your booking request. ${error instanceof Error ? error.message : 'Please check your connection.'} Review the details or try again.`);
      }
      focusErrors();
      return;
    } finally {
      submitting.current = false;
    }
    setReceivedBooking(result);
    // Initiate Hitpay payment for the new booking
    try {
      setPaymentBusy(true);
      const payment = await bookingsApi.pay(result.id);
      setPaymentUrl(payment.paymentUrl);
      setPaymentBillId(payment.billId);
      setPaymentStatus('pending');
    } catch (error: any) {
      setSubmitError(error.message || 'Booking created, but payment could not be initiated. You can pay later.');
      setPaymentStatus(null);
    } finally {
      setPaymentBusy(false);
    }
    setStep(4);
    onBookingSuccess(result);
  };

  const dates = getBookingDates(salon.workingHours);
  const summaryErrors = step === 1
    ? Object.entries(scheduleErrors).filter(([, message]) => message)
    : step === 2 ? Object.entries(errors).map(([field, error]) => [field, error.message]) : [];
  const travelFee = getBookingTravelFee(isLocationEvent, travelQuote);
  const stepTitle = ['Date & time', 'Your details', 'Review your request', 'Booking request received'][step - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={step !== 4 ? closeBooking : undefined}
        aria-hidden="true"
        className="absolute inset-0 bg-canvas/85 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={fieldId('title')}
        aria-describedby={fieldId('description')}
        onKeyDown={(event) => {
          // Scoped to this dialog: Escape in the overlaid AuthModal must not
          // dismiss the booking or discard the client's draft.
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closeBooking();
          }
        }}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.95, y: reducedMotion ? 0 : 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.95, y: reducedMotion ? 0 : 15 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-accent-strong [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-accent-strong"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h3 ref={titleRef} tabIndex={-1} id={fieldId('title')} className="font-serif text-lg font-medium text-fg focus:outline-none">
              {stepTitle}
            </h3>
            <p id={fieldId('description')} className="text-xs text-fg-muted mt-0.5">
              {step < 4 && `Step ${step} of 3 · `}{salon.name} &bull; {service.name}
            </p>
          </div>
          {step !== 4 && (
            <button
              type="button"
              onClick={closeBooking}
              aria-label="Close booking dialog"
              disabled={createBooking.isPending}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-50"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
        </div>

        <div ref={contentRef} className="min-h-0 overflow-y-auto p-6">
          {(summaryErrors.length > 0 || (step === 3 && submitError)) && (
            <div ref={errorSummaryRef} tabIndex={-1} role="alert" className="mb-5 rounded-xl border border-danger-border/40 bg-danger-surface/10 p-4 text-sm text-danger focus:outline-2 focus:outline-accent-strong">
              <p className="font-semibold">{step === 3 ? submitError : 'Please check the following before continuing:'}</p>
              {summaryErrors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {summaryErrors.map(([field, message]) => (
                    <li key={field}>
                      <a href={`#${fieldId(field)}`} className="underline" onClick={(event) => {
                        event.preventDefault();
                        document.getElementById(fieldId(field))?.focus();
                      }}>{message}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, x: reducedMotion ? 0 : -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reducedMotion ? 0 : 10 }}
                className="space-y-6"
              >
                <p className="text-sm text-fg-muted">Choose your preferred appointment. Availability is subject to studio confirmation.</p>
                <fieldset id={fieldId('staff')} tabIndex={-1} aria-invalid={!!scheduleErrors.staff} aria-describedby={scheduleErrors.staff ? fieldId('staff-error') : undefined}>
                  <legend className="text-xs font-mono tracking-wider text-fg uppercase block mb-3">
                    Choose Specialist
                  </legend>
                  {salon.staff.length === 0 && <p className="text-sm text-fg-muted">No specialists are listed for online booking. Please contact the studio.</p>}
                  <div className="grid grid-cols-2 gap-3">
                    {salon.staff.map((staff) => (
                      <button
                        key={staff.id}
                        id={fieldId(`staff-${staff.id}`)}
                        type="button"
                        aria-label={`Choose ${staff.name}, ${staff.role}`}
                        aria-describedby={scheduleErrors.staff ? fieldId('staff-error') : undefined}
                        onClick={() => {
                          setSelectedStaff(staff);
                          setScheduleErrors(previous => ({ ...previous, staff: undefined }));
                        }}
                        aria-pressed={selectedStaff?.id === staff.id}
                        className={`flex items-center space-x-3 rounded-xl border p-3 text-left transition-all duration-300 ${
                          selectedStaff?.id === staff.id
                            ? 'border-accent bg-accent/5'
                            : 'border-line bg-surface/30 hover:border-line'
                        }`}
                      >
                        <img
                          src={staff.avatar}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover grayscale"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-fg">{staff.name}</p>
                          <p className="truncate text-[10px] text-fg-muted">{staff.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {scheduleErrors.staff && <p id={fieldId('staff-error')} className="mt-2 text-sm text-danger">{scheduleErrors.staff}</p>}
                </fieldset>

                <fieldset id={fieldId('date')} tabIndex={-1} aria-invalid={!!scheduleErrors.date} aria-describedby={scheduleErrors.date ? fieldId('date-error') : undefined}>
                  <legend className="text-xs font-mono tracking-wider text-fg uppercase block mb-3">Select Date (required)</legend>
                  {dates.length === 0 && <p className="text-sm text-fg-muted">No appointment dates are listed in the next two weeks. Please contact the studio.</p>}
                  <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-surface">
                    {dates.map((d) => (
                      <button
                        key={d.value}
                        id={fieldId(`date-${d.value}`)}
                        type="button"
                        aria-label={formatBookingDate(d.value)}
                        aria-pressed={selectedDate === d.value}
                        aria-describedby={scheduleErrors.date ? fieldId('date-error') : undefined}
                        onClick={() => {
                          setSelectedDate(d.value);
                          setScheduleErrors(previous => ({ ...previous, date: undefined }));
                        }}
                        className={`flex flex-col items-center justify-center shrink-0 rounded-xl w-14 py-3 border transition-all duration-300 ${
                          selectedDate === d.value
                            ? 'border-accent bg-accent/10 text-fg'
                            : 'border-line bg-surface/30 text-fg-muted hover:border-line hover:text-fg'
                        }`}
                      >
                        <span className="text-[10px] font-mono uppercase tracking-tight">{d.day}</span>
                        <span className="text-base font-serif font-bold mt-1">{d.number}</span>
                        <span className="text-[9px] opacity-70 mt-0.5">{d.month}</span>
                      </button>
                    ))}
                  </div>
                  {scheduleErrors.date && <p id={fieldId('date-error')} className="mt-2 text-sm text-danger">{scheduleErrors.date}</p>}
                </fieldset>

                <fieldset id={fieldId('time')} tabIndex={-1} aria-invalid={!!scheduleErrors.time} aria-describedby={scheduleErrors.time ? fieldId('time-error') : undefined}>
                  <legend className="text-xs font-mono tracking-wider text-fg uppercase block mb-3">
                    Preferred Time (required)
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {bookingTimeSlots.map((time) => (
                      <button
                        key={time}
                        id={fieldId(`time-${time.replace(/[^a-z0-9]/gi, '-')}`)}
                        type="button"
                        aria-label={`Choose ${time}`}
                        aria-pressed={selectedTime === time}
                        aria-describedby={scheduleErrors.time ? fieldId('time-error') : undefined}
                        onClick={() => {
                          setSelectedTime(time);
                          setScheduleErrors(previous => ({ ...previous, time: undefined }));
                        }}
                        className={`min-h-11 rounded-lg py-2 text-center text-xs border transition-all duration-300 ${
                          selectedTime === time
                            ? 'border-accent bg-primary text-on-primary'
                            : 'border-line bg-surface/30 text-fg-muted hover:border-line hover:text-fg'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                  {scheduleErrors.time && <p id={fieldId('time-error')} className="mt-2 text-sm text-danger">{scheduleErrors.time}</p>}
                </fieldset>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full flex items-center justify-center space-x-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-on-primary transition-all duration-300 hover:bg-primary-hover shadow-lg shadow-accent/20"
                >
                  <span>Continue to Details</span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, x: reducedMotion ? 0 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reducedMotion ? 0 : -10 }}
              >
                <form noValidate onSubmit={handleSubmit(onReview, focusErrors)} className="space-y-5">
                  <p className="text-sm text-fg-muted">Continue as a guest or sign in to auto-fill. You will review your request before sending it.</p>
                  {attachedMoodboard && (
                    <div className="rounded-xl border border-accent-soft/50 bg-accent/10 p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-fg font-semibold flex items-center gap-1.5">
                          <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-fg" />
                          Attached Custom Lookbook
                        </span>
                        <span className="text-[10px] text-fg-muted capitalize">{attachedMoodboard.category}</span>
                      </div>
                      <p className="text-xs font-serif font-bold text-fg">{attachedMoodboard.lookName}</p>
                      <div className="flex items-center gap-1.5 pt-1">
                        {attachedMoodboard.colorPalette.map((swatch, idx) => (
                          <div
                            key={idx}
                            title={swatch.name}
                            className="h-4 w-4 rounded-full border border-fg/20 shadow-sm"
                            style={{ backgroundColor: swatch.hex }}
                          />
                        ))}
                        <span className="text-[10px] text-fg-muted ml-2 truncate">
                          Lip: {attachedMoodboard.lipFormula.shade}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-line bg-surface/40 p-4 space-y-2.5 text-xs [&>div]:gap-3 [&>div>span:last-child]:text-right">
                    <div className="flex justify-between border-b border-line/50 pb-2">
                      <span className="text-fg-muted">Makeup Artist:</span>
                      <span className="font-semibold text-fg">{selectedStaff?.name || 'Assigned by the studio'}</span>
                    </div>
                    <div className="flex justify-between border-b border-line/50 pb-2">
                      <span className="text-fg-muted">Appointment:</span>
                      <span className="font-semibold text-fg">
                        {formatBookingDate(selectedDate)} at {selectedTime}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-line/50 pb-2">
                      <span className="text-fg-muted">Base Service Fee:</span>
                      <span className="text-fg font-medium">RM{service.price}</span>
                    </div>
                    {isLocationEvent && (
                      <div className="flex justify-between border-b border-line/50 pb-2 text-accent-text/90">
                        <span className="flex items-center gap-1">
                          <Car aria-hidden="true" className="h-3 w-3" />
                          {travelQuote ? 'Estimated Travel & Kit Fee:' : 'Provisional Kit Fee:'}
                        </span>
                        <span className="font-medium">+RM{travelFee}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1">
                      <span className="text-fg-muted">Total Estimated:</span>
                      <span className="font-serif font-bold text-base text-fg">
                        RM{service.price + travelFee}
                      </span>
                    </div>
                  </div>

                  <fieldset className="rounded-xl border border-line bg-recessed p-3 space-y-3">
                    <legend className="text-xs font-mono tracking-wider text-fg uppercase block">
                      Appointment Location
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        id={fieldId('in-studio')}
                        type="button"
                        aria-pressed={!isLocationEvent}
                        onClick={() => {
                          setValue('isLocationEvent', false);
                          clearErrors('eventVenue');
                          invalidateTravelQuote();
                        }}
                        className={`min-h-11 py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                          !isLocationEvent
                            ? 'border-accent bg-accent/20 text-fg'
                            : 'border-line text-fg-dim hover:border-line'
                        }`}
                      >
                        In Studio Atelier
                      </button>
                      <button
                        id={fieldId('on-location')}
                        type="button"
                        aria-pressed={isLocationEvent}
                        onClick={() => setValue('isLocationEvent', true)}
                        className={`min-h-11 py-2 px-3 rounded-lg text-xs font-medium border text-center transition-all ${
                          isLocationEvent
                            ? 'border-accent bg-accent/20 text-fg'
                            : 'border-line text-fg-dim hover:border-line'
                        }`}
                      >
                        On-Location / Venue
                      </button>
                    </div>

                    {isLocationEvent && (
                      <div className="pt-2 space-y-2 border-t border-line">
                        <label htmlFor={fieldId('eventVenue')} className="text-xs font-mono tracking-wider text-fg-muted uppercase block">
                          Event Venue / Hotel Suite Address (required)
                        </label>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            id={fieldId('eventVenue')}
                            type="text"
                            required
                            {...register('eventVenue', { onChange: invalidateTravelQuote })}
                            aria-invalid={!!errors.eventVenue}
                            aria-describedby={`${fieldId('travel-hint')}${errors.eventVenue ? ` ${fieldId('eventVenue-error')}` : ''}${travelError ? ` ${fieldId('travel-error')}` : ''}`}
                            placeholder="e.g. The Majestic Hotel, Grand Ballroom / Suite 902"
                            className="min-w-0 flex-1 rounded-lg border border-accent-soft bg-recessed-deep px-3 py-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong"
                          />
                          <button
                            type="button"
                            onClick={handleEstimateTravel}
                            disabled={calculatingTravel}
                            aria-describedby={fieldId('travel-hint')}
                            className="min-h-11 px-3 py-2 rounded-lg bg-surface hover:bg-chip text-fg text-xs font-mono disabled:opacity-50 shrink-0 border border-line flex items-center justify-center gap-1.5"
                          >
                            {calculatingTravel ? <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : <Calculator aria-hidden="true" className="h-3 w-3 text-fg" />}
                            <span>{calculatingTravel ? 'Calculating…' : 'Calculate travel'}</span>
                          </button>
                        </div>
                        {errors.eventVenue && <p id={fieldId('eventVenue-error')} className="text-sm text-danger">{errors.eventVenue.message}</p>}
                        <p id={fieldId('travel-hint')} className="text-xs leading-relaxed text-fg-muted">Without a travel estimate, the total includes a provisional RM50 kit fee only. Mileage and the final fee are subject to studio confirmation.</p>
                        {travelError && <p id={fieldId('travel-error')} role="alert" className="text-sm text-danger">{travelError}</p>}

                        <div role="status" aria-live="polite" aria-atomic="true">
                          {calculatingTravel && <p className="text-sm text-fg-muted">Calculating the travel estimate…</p>}
                          {travelQuote && (
                            <div className="p-2.5 rounded-lg bg-canvas/40 border border-line text-xs text-fg-muted space-y-1">
                              {travelQuote.estimateSource === 'sample' && <p className="font-semibold text-fg">Sample travel estimate · not a live route calculation</p>}
                              <div className="flex flex-wrap justify-between gap-2 text-fg">
                                <span>Estimated Distance: <strong>{travelQuote.distanceKm} km</strong></span>
                                <span>Drive Time: ~{travelQuote.estimatedDriveMinutes} mins</span>
                              </div>
                              <div className="flex flex-wrap justify-between gap-2 text-fg-muted">
                                <span>Base mobile kit (RM{travelQuote.baseKitFee}) + mileage (RM{travelQuote.mileageFee})</span>
                                <span className="text-fg font-semibold">RM{travelQuote.totalTravelFee} total</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </fieldset>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor={fieldId('clientName')} className="text-xs font-mono tracking-wider text-fg uppercase block mb-1.5">
                        Client Full Name (required)
                      </label>
                      <input
                        id={fieldId('clientName')}
                        type="text"
                        autoComplete="name"
                        required
                        {...register('clientName')}
                        aria-invalid={!!errors.clientName}
                        aria-describedby={errors.clientName ? fieldId('clientName-error') : undefined}
                        placeholder="e.g. Amanda Seyfried"
                        className="w-full rounded-xl border border-accent-soft bg-surface/40 px-4 py-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong"
                      />
                      {errors.clientName && (
                        <p id={fieldId('clientName-error')} className="text-sm text-danger mt-1">{errors.clientName.message}</p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor={fieldId('clientEmail')} className="text-xs font-mono tracking-wider text-fg uppercase block">
                          Email Address (required)
                        </label>
                        {!currentUser && (
                          <button
                            type="button"
                            onClick={() => onOpenAuth('signin')}
                            className="min-h-11 text-xs text-fg hover:underline"
                          >
                            Sign in to auto-fill
                          </button>
                        )}
                      </div>
                      <input
                        id={fieldId('clientEmail')}
                        type="email"
                        autoComplete="email"
                        required
                        {...register('clientEmail')}
                        readOnly={!!currentUser}
                        aria-invalid={!!errors.clientEmail}
                        aria-describedby={`${fieldId('email-hint')}${errors.clientEmail ? ` ${fieldId('clientEmail-error')}` : ''}`}
                        placeholder="client@example.com"
                        className={`w-full rounded-xl border border-accent-soft px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent-strong transition-colors ${
                          currentUser
                            ? 'bg-surface/20 text-fg-muted'
                            : 'bg-surface/40 text-fg placeholder-fg-dim focus:border-accent-strong focus:ring-1 focus:ring-accent-strong'
                        }`}
                      />
                      {errors.clientEmail && (
                        <p id={fieldId('clientEmail-error')} className="text-sm text-danger mt-1">{errors.clientEmail.message}</p>
                      )}
                      <p id={fieldId('email-hint')} className="text-xs text-fg-muted mt-1">
                        {currentUser ? 'Using the email address on your signed-in account.' : 'The studio can use this address to contact you about your request.'}
                      </p>
                    </div>

                    <div>
                      <label htmlFor={fieldId('clientPhone')} className="text-xs font-mono tracking-wider text-fg uppercase block mb-1.5">
                        Telephone Number (required)
                      </label>
                      <input
                        id={fieldId('clientPhone')}
                        type="tel"
                        autoComplete="tel"
                        required
                        {...register('clientPhone')}
                        aria-invalid={!!errors.clientPhone}
                        aria-describedby={errors.clientPhone ? fieldId('clientPhone-error') : undefined}
                        placeholder="e.g. +60 12-345 6789"
                        className="w-full rounded-xl border border-accent-soft bg-surface/40 px-4 py-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong"
                      />
                      {errors.clientPhone && (
                        <p id={fieldId('clientPhone-error')} className="text-sm text-danger mt-1">{errors.clientPhone.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor={fieldId('notes')} className="text-xs font-mono tracking-wider text-fg uppercase block mb-1.5">
                        Add Special Instructions (Optional)
                      </label>
                      <textarea
                        id={fieldId('notes')}
                        {...register('notes')}
                        aria-invalid={!!errors.notes}
                        aria-describedby={`${fieldId('notes-hint')}${errors.notes ? ` ${fieldId('notes-error')}` : ''}`}
                        placeholder="e.g. Skin sensitivity, dress color, ceremony lighting, preferred lipstick finish..."
                        rows={2}
                        className="w-full rounded-xl border border-accent-soft bg-surface/40 px-4 py-3 text-sm text-fg placeholder-fg-dim focus:border-accent-strong focus:outline-none focus:ring-1 focus:ring-accent-strong resize-none"
                      />
                      <p id={fieldId('notes-hint')} className="mt-1 text-xs text-fg-muted">Up to 1,000 characters.</p>
                      {errors.notes && <p id={fieldId('notes-error')} className="mt-1 text-sm text-danger">{errors.notes.message}</p>}
                    </div>
                  </div>

                  <div className="flex space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="w-1/3 rounded-xl border border-line py-3.5 text-xs font-semibold text-fg-muted transition-all duration-300 hover:bg-surface hover:text-fg"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={calculatingTravel}
                      className="flex-1 flex items-center justify-center space-x-2 rounded-xl bg-primary py-3.5 text-xs font-semibold text-on-primary transition-all duration-300 hover:bg-primary-hover disabled:opacity-50"
                    >
                      <span>{calculatingTravel ? 'Waiting for travel estimate…' : 'Review booking request'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 3 && reviewedRequest && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <BookingReview
                  request={reviewedRequest}
                  salon={salon}
                  service={service}
                  staffName={selectedStaff?.name}
                  travelQuote={travelQuote}
                  isSubmitting={createBooking.isPending}
                  onEdit={() => { setSubmitError(null); setStep(2); }}
                  onSubmit={onSubmit}
                />
                {verificationNeeded && (
                  <div className="mt-4 space-y-2 rounded-xl border border-warning-border/40 bg-warning-surface/10 p-4 text-sm">
                    <p className="font-medium text-fg">
                      {verificationSent ? 'Enter your verification code' : 'Verify your email address'}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {verificationSent
                        ? 'Check the inbox for the six-digit code we sent, enter it below, then submit again.'
                        : 'We need to confirm this email address is yours before the booking is created.'}
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-digit code"
                        aria-label="Email verification code"
                        className="w-36 rounded-lg border border-accent-soft bg-surface px-3 py-2 text-sm tracking-[0.3em] text-fg focus:border-accent-strong focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const email = (reviewedRequest as { clientEmail?: string }).clientEmail ?? '';
                          void requestVerificationCode(email, verificationSent);
                        }}
                        disabled={verificationBusy}
                        className="rounded-lg border border-line bg-elevated px-3 py-2 text-xs font-semibold text-fg transition-colors hover:border-accent-soft disabled:opacity-50"
                      >
                        {verificationBusy ? 'Sending…' : verificationSent ? 'Resend code' : 'Send code'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 4 && receivedBooking && (
              <motion.div key="step-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <BookingReceipt booking={receivedBooking} onClose={closeBooking} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

export function BookingReview({ request, salon, service, staffName, travelQuote, isSubmitting, onEdit, onSubmit }: {
  request: BookingRequest;
  salon: Salon;
  service: Service;
  staffName?: string;
  travelQuote: BookingTravelQuote | null;
  isSubmitting: boolean;
  onEdit: () => void;
  onSubmit: () => void;
}) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="space-y-5" aria-busy={isSubmitting}>
      <p className="text-sm leading-relaxed text-fg-muted">Check your appointment and contact details. Sending this request does not confirm a slot; the studio must confirm availability.</p>
      <dl className="space-y-3 rounded-xl border border-line bg-surface/40 p-4 text-sm [&_dt]:font-mono [&_dt]:text-xs [&_dt]:text-fg-muted [&_dd]:mt-1 [&_dd]:break-words [&_dd]:text-fg">
        <div><dt>Studio</dt><dd>{salon.name}</dd></div>
        <div><dt>Service</dt><dd>{service.name} · {service.duration} minutes</dd></div>
        <div><dt>Makeup artist</dt><dd>{staffName || 'Assigned by the studio'}</dd></div>
        <div><dt>Requested appointment</dt><dd>{formatBookingDate(request.date)} at {request.time}</dd></div>
        <div><dt>Location</dt><dd>{request.isLocationEvent ? request.eventVenue : `In studio · ${salon.address}`}</dd></div>
        <div><dt>Client full name</dt><dd>{request.clientName}</dd></div>
        <div><dt>Email address</dt><dd>{request.clientEmail}</dd></div>
        <div><dt>Telephone number</dt><dd>{request.clientPhone}</dd></div>
        {request.notes && <div><dt>Special instructions</dt><dd className="whitespace-pre-wrap">{request.notes}</dd></div>}
        {request.attachedMoodboard && <div><dt>Attached lookbook</dt><dd>{request.attachedMoodboard.lookName}</dd></div>}
        <div className="border-t border-line pt-3"><dt>Base service fee</dt><dd>RM{service.price}</dd></div>
        {request.isLocationEvent && <div><dt>{travelQuote ? 'Estimated travel & kit fee' : 'Provisional kit fee'}</dt><dd>RM{request.travelSurcharge}</dd></div>}
        <div><dt>Total estimated</dt><dd className="font-serif text-xl font-semibold">RM{service.price + (request.travelSurcharge || 0)}</dd></div>
      </dl>
      {request.isLocationEvent && (
        <p className="text-sm leading-relaxed text-fg-muted">{travelQuote?.estimateSource === 'sample' && 'Sample travel estimate, not a live route calculation. '}{travelQuote
          ? 'Travel and the final fee are subject to studio confirmation.'
          : 'This total includes a provisional RM50 kit fee only. Mileage has not been calculated and may increase the final fee. The studio will need to confirm it.'}</p>
      )}
      <div role="status" aria-live="polite" className="text-sm text-fg-muted">{isSubmitting ? 'Sending your booking request. Please wait…' : 'Ready to send your request.'}</div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onEdit} disabled={isSubmitting} className="min-h-11 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-fg hover:bg-surface disabled:opacity-50">Edit details</button>
        <button type="submit" disabled={isSubmitting} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50">
          {isSubmitting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
          {isSubmitting ? 'Sending request…' : 'Send booking request'}
        </button>
      </div>
    </form>
  );
}

export function BookingReceipt({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  return (
    <div className="space-y-6 py-4 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-surface/10">
        <CheckCircle2 aria-hidden="true" className="h-8 w-8 text-success" />
      </div>
      <div role="status" className="space-y-2">
        <h4 className="font-serif text-2xl font-semibold text-fg">Booking request received</h4>
        <p className="text-sm font-semibold text-fg">Pending studio confirmation</p>
        <p className="text-sm leading-relaxed text-fg-muted">Your request has been saved with {booking.salonName}. Your appointment is not confirmed yet. Keep your booking reference for any follow-up with the studio.</p>
      </div>
      <dl className="space-y-3 rounded-xl border border-dashed border-line bg-surface/60 p-5 text-left text-sm [&_dt]:font-mono [&_dt]:text-xs [&_dt]:text-fg-muted [&_dd]:mt-1 [&_dd]:break-words [&_dd]:text-fg">
        <div><dt>Booking reference</dt><dd className="font-mono">{booking.id}</dd></div>
        <div className="border-t border-line pt-3"><dt>Service</dt><dd>{booking.serviceName}</dd></div>
        <div><dt>Requested appointment</dt><dd>{formatBookingDate(booking.date)} at {booking.time}</dd></div>
        <div><dt>Makeup artist</dt><dd>{booking.staffName || 'Assigned by the studio'}</dd></div>
        <div><dt>Location</dt><dd>{booking.isLocationEvent ? booking.eventVenue : booking.salonAddress}</dd></div>
        <div><dt>Total estimated</dt><dd className="font-serif text-lg font-semibold">RM{booking.servicePrice + (booking.travelSurcharge || 0)}</dd></div>
        <div><dt>Contact email</dt><dd>{booking.clientEmail}</dd></div>
        {booking.attachedMoodboard && <div><dt>Attached lookbook</dt><dd>{booking.attachedMoodboard.lookName}</dd></div>}
      </dl>
      <button type="button" onClick={onClose} className="min-h-11 w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover">
        Return to browsing
      </button>
    </div>
  );
}
