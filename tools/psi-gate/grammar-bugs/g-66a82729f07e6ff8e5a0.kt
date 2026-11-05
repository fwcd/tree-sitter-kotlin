sealed class TestStepBuilder<InputArtifact, OutputArtifact, out FacadeStep>
        where InputArtifact : ResultingArtifact<InputArtifact>,
              FacadeStep : TestStep<InputArtifact, OutputArtifact> {
    sealed class FacadeStepBuilder<InputArtifact,InputArtifact, OutputArtifact, FacadeStep>()
            where 
                  FacadeStep : TestStep<InputArtifact, OutputArtifact> {
        class NonGroupingStage<InputArtifact, InputArtifactKind>(
        ) : HandlersStepBuilder<
                TestStep.GroupingStageStep.HandlersStep<InputArtifact>>
            (artifactKind, compilationStage)
    }
}