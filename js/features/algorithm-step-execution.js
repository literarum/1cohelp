'use strict';

const MODAL_ID = 'algorithmModal';
const STEPS_CONTAINER_ID = 'algorithmSteps';
const START_BUTTON_ID = 'startStepExecutionBtn';
const CONTROLS_CONTAINER_ID = 'algorithmStepExecutionControls';
const PREV_BUTTON_ID = 'prevStepExecutionBtn';
const NEXT_BUTTON_ID = 'nextStepExecutionBtn';
const EXIT_BUTTON_ID = 'exitStepExecutionBtn';
const PROGRESS_LABEL_ID = 'algorithmStepExecutionProgress';
const ACTIVE_MODE_CLASS = 'algorithm-step-execution-active';
const ACTIVE_STEP_CLASS = 'step-execution-active-step';
const DIMMED_STEP_CLASS = 'step-execution-dimmed-step';

let state = {
    isActive: false,
    currentIndex: 0,
};

function getModalElements() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return null;

    return {
        modal,
        stepsContainer: modal.querySelector(`#${STEPS_CONTAINER_ID}`),
        startButton: modal.querySelector(`#${START_BUTTON_ID}`),
        controlsContainer: modal.querySelector(`#${CONTROLS_CONTAINER_ID}`),
        prevButton: modal.querySelector(`#${PREV_BUTTON_ID}`),
        nextButton: modal.querySelector(`#${NEXT_BUTTON_ID}`),
        exitButton: modal.querySelector(`#${EXIT_BUTTON_ID}`),
        progressLabel: modal.querySelector(`#${PROGRESS_LABEL_ID}`),
    };
}

function getStepElements(stepsContainer) {
    if (!stepsContainer) return [];
    return Array.from(stepsContainer.querySelectorAll('.algorithm-step'));
}

function updateStepClasses(steps, currentIndex) {
    steps.forEach((stepElement, index) => {
        const isCurrentStep = index === currentIndex;
        stepElement.classList.toggle(ACTIVE_STEP_CLASS, isCurrentStep);
        stepElement.classList.toggle(DIMMED_STEP_CLASS, !isCurrentStep);
    });
}

function updateControls(
    controlsContainer,
    startButton,
    prevButton,
    nextButton,
    progressLabel,
    totalSteps,
    uiState,
) {
    if (controlsContainer) {
        controlsContainer.classList.toggle('hidden', !state.isActive || !uiState.hasSteps);
    }
    if (startButton) {
        startButton.disabled = !uiState.hasSteps || state.isActive;
    }
    if (prevButton) {
        prevButton.disabled = !uiState.canGoPrev;
    }
    if (nextButton) {
        nextButton.disabled = !uiState.canGoNext;
    }
    if (progressLabel) {
        progressLabel.textContent = getStepExecutionProgressText(uiState.currentIndex, totalSteps);
    }
}

function syncUi() {
    const elements = getModalElements();
    if (!elements) return;

    const steps = getStepElements(elements.stepsContainer);
    const uiState = getStepExecutionUiState(state.currentIndex, steps.length);
    state.currentIndex = uiState.currentIndex;

    if (!state.isActive || !uiState.hasSteps) {
        elements.modal.classList.remove(ACTIVE_MODE_CLASS);
        steps.forEach((stepElement) => {
            stepElement.classList.remove(ACTIVE_STEP_CLASS, DIMMED_STEP_CLASS);
        });
        updateControls(
            elements.controlsContainer,
            elements.startButton,
            elements.prevButton,
            elements.nextButton,
            elements.progressLabel,
            steps.length,
            uiState,
        );
        return;
    }

    elements.modal.classList.add(ACTIVE_MODE_CLASS);
    updateStepClasses(steps, uiState.currentIndex);

    const currentStep = steps[uiState.currentIndex];
    if (currentStep) {
        currentStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    updateControls(
        elements.controlsContainer,
        elements.startButton,
        elements.prevButton,
        elements.nextButton,
        elements.progressLabel,
        steps.length,
        uiState,
    );
}

function goToStep(nextIndex) {
    const elements = getModalElements();
    if (!elements) return;

    const steps = getStepElements(elements.stepsContainer);
    const totalSteps = steps.length;
    if (totalSteps === 0) {
        resetAlgorithmStepExecutionMode();
        return;
    }

    state.currentIndex = clampStepIndex(nextIndex, totalSteps);
    syncUi();
}

export function clampStepIndex(index, totalSteps) {
    if (!Number.isInteger(totalSteps) || totalSteps <= 0) return 0;
    if (!Number.isInteger(index) || index < 0) return 0;
    if (index >= totalSteps) return totalSteps - 1;
    return index;
}

export function getStepExecutionUiState(currentIndex, totalSteps) {
    const hasSteps = Number.isInteger(totalSteps) && totalSteps > 0;
    const safeIndex = clampStepIndex(currentIndex, totalSteps);
    const isFirst = safeIndex <= 0;
    const isLast = !hasSteps || safeIndex >= totalSteps - 1;

    return {
        hasSteps,
        currentIndex: safeIndex,
        isFirst,
        isLast,
        canGoPrev: hasSteps && !isFirst,
        canGoNext: hasSteps && !isLast,
    };
}

export function getStepExecutionProgressText(currentIndex, totalSteps) {
    const uiState = getStepExecutionUiState(currentIndex, totalSteps);
    if (!uiState.hasSteps) {
        return 'Шаги отсутствуют';
    }

    return `Шаг ${uiState.currentIndex + 1} из ${totalSteps}`;
}

export function startAlgorithmStepExecutionMode() {
    const elements = getModalElements();
    if (!elements) return;

    const steps = getStepElements(elements.stepsContainer);
    if (steps.length === 0) {
        state.isActive = false;
        state.currentIndex = 0;
        syncUi();
        return;
    }

    state.isActive = true;
    state.currentIndex = 0;
    syncUi();
}

export function resetAlgorithmStepExecutionMode() {
    state.isActive = false;
    state.currentIndex = 0;
    syncUi();
}

export function refreshAlgorithmStepExecutionAvailability() {
    const elements = getModalElements();
    if (!elements) return;

    const steps = getStepElements(elements.stepsContainer);
    if (steps.length === 0 && state.isActive) {
        state.isActive = false;
        state.currentIndex = 0;
    } else if (state.isActive) {
        state.currentIndex = clampStepIndex(state.currentIndex, steps.length);
    }

    syncUi();
}

export function initAlgorithmStepExecution() {
    const elements = getModalElements();
    if (!elements) return;
    if (elements.modal.dataset.stepExecutionInitialized === '1') return;

    if (elements.startButton) {
        elements.startButton.addEventListener('click', () => {
            startAlgorithmStepExecutionMode();
        });
    }

    if (elements.prevButton) {
        elements.prevButton.addEventListener('click', () => {
            goToStep(state.currentIndex - 1);
        });
    }

    if (elements.nextButton) {
        elements.nextButton.addEventListener('click', () => {
            goToStep(state.currentIndex + 1);
        });
    }

    if (elements.exitButton) {
        elements.exitButton.addEventListener('click', () => {
            resetAlgorithmStepExecutionMode();
        });
    }

    elements.modal.dataset.stepExecutionInitialized = '1';
    refreshAlgorithmStepExecutionAvailability();
}

export const __algorithmStepExecutionTestables = {
    clampStepIndex,
    getStepExecutionUiState,
    getStepExecutionProgressText,
};
