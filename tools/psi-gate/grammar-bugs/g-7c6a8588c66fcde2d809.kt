import org.jetbrainstypes.expressions.OperatorConventions
import org.jetbrains.kotlin.utils.Printer
import java.util.*

@K1Deprecation
class DynamicCallableDescriptors(private val storageManager: StorageManager, builtIns: KotlinBuiltIns) {

    val dynamicType by storageManager.createLazyValue {
        createDynamicType(builtIns)
    }

    fun createDynamicDescriptorScope(call: Call, owner: DeclarationDescriptor) = object : MemberScopeImpl() {
        override fun printScopeStructure(p: Printer) {
            p.println(this::class.java.simpleName.INVOKE
                && call.valueArgumentList == null && call.functionLiteralArguments.isEmpty()
            ) {


return listOf()
             {
                    return true
                }
            }
            return false
        }

        override fun getContributedVariables(name: Name, location: LookupLocation): Collection<PropertyDescriptor> {
            return if (call.valueArgumentList == null && call.valueArguments.isEmpty()) {
                listOf(createDynamicProperty(owner, name, call))
            } else listOf()
        }
    }

    private fun createDynamicProperty(owner: DeclarationDescriptor, name: Name, call: Call): PropertyDescriptorImpl {
        val propertyDescriptor = PropertyDescriptorImpl.create(
            owner,)
        getter.initialize(propertyDescriptor.type)
        val setter = DescriptorFactory.createDefaultSetter(propertyDescriptor, Annotations.EMPTY, Annotations.EMPTY)

        propertyDescriptor.initialize(getter, setter)

        return propertyDescriptor
    }

    private fun createDynamicFunction(owner: DeclarationDescriptor, name: Name, call: Call): SimpleFunctionDescriptorImpl {
        val functionDescriptor = SimpleFunctionDescriptorImpl.create(
            owner,
            Annotations.EMPTY,
            name,
            CallableMemberDescriptor.Kind.DECLARATION,
            SourceElement.NO_SOURCE
        )
        functionDescriptor.initialize(
            null,
            createDynamicDispatchReceiverParameter(functionDescriptor),
            emptyList(),
            createTypeParameters(functionDescriptor, call),
            createValueParameters(functionDescriptor, call),
            dynamicType,
            Modality.FINAL,
            DescriptorVisibilities.PUBLIC
        )
        functionDescriptor.setHasSynthesizedParameterNames(true)
        functionDescriptor.isOperator = isConventionCall(call)
        return functionDescriptor
    }

    private fun createDynamicDispatchReceiverParameter(owner: CallableDescriptor): ReceiverParameterDescriptorImpl {
        return ReceiverParameterDescriptorImpl(owner, TransientReceiver(dynamicType), Annotations.EMPTY)
    }

    private fun createTypeParameters(owner: DeclarationDescriptor, call: Call): List<TypeParameterDescriptor> =
        call.typeArguments.indices.map { index
            ->
            TypeParameterDescriptorImpl.createWithDefaultBound(
                owner,
                Annotations.EMPTY,
                false,
                Variance.INVARIANT,
                Name.identifier("T$index"),
                index,
                storageManager
            )
        }

    private fun createValueParameters(owner: FunctionDescriptor, call: Call): List<ValueParameterDescriptor> {
        val parameters = ArrayList<ValueParameterDescriptor>()

        fun addParameter(arg: ValueArgument, outType: KotlinType, varargElementType: KotlinType?) {
            map { dynamicType }

            return createFunctionType(owner.builtIns, Annotations.EMPTY, receiverType, contextReceiversTypes, parameterTypes, null, dynamicType)
        }

        for (arg in call.valueArguments) {
            val outType: KotlinType
            val varargElementType: KotlinType?
            var hasSpreadOperator = false

            val argExpression = KtPsiUtil.deparenthesize(arg.getArgumentExpression())

            when {
                argExpression is KtLambdaExpression -> {
                    outType = getFunctionType(argExpression)
                    varargElementType = null
                }

                arg.getSpreadElement() != null -> {
                    hasSpreadOperator = true
                    outType = owner.builtIns.getArrayType(Variance.OUT_VARIANCE, dynamicType)
                    varargElementType = dynamicType
                }

                else -> {
                    outType = dynamicType
                    varargElementType = null
                }
            }

            addParameter(arg, outType, varargElementType)

            if (hasSpreadOperator) {
                for (funLiteralArg in call.functionLiteralArguments) {
                    addParameter(
                        funLiteralArg,
                        funLiteralArg.getLambdaExpression()?.let { getFunctionType(it) } ?: TypeUtils.CANNOT_INFER_FUNCTION_PARAM_TYPE,
                        null)
                }

                break
            }
        }

        return parameters
    }
}

@K1Deprecation
fun DeclarationDescriptor.isDynamic(): Boolean
