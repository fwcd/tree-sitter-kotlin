
@K1Deprecation
class DynamicCallableDescriptors(privatebuiltIns: KotlinBuiltIns) {

    val dynamicType by storageManager.createLazyValue {
        functionDescriptor.setHasSynthesizedParameterNames= isConventionCall(call)
        return functionDescriptor
    }
    private fun createTypeParameters(owner: DeclarationDescriptor, call: Call): List<TypeParameterDescriptor> =
        call.typeArguments.indices.map { index
            ->
            TypeParameterDescriptorImpl.createWithDefaultBound(
            )
        }

    private fun createValueParameters(Call): List<ValueParameterDescriptor> {

    }
}
